pub async fn get_contract_deployments(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<DeploymentHistoryQueryParams>,
) -> ApiResult<Json<PaginatedResponse<ContractDeploymentHistory>>> {
    let contract_uuid = Uuid::parse_str(&id).ok();

    // Resolve target UUIDs (across all networks if logical_id exists)
    let target_uuids = if let Some(uuid) = contract_uuid {
        let logical_id: Option<Uuid> =
            sqlx::query_scalar("SELECT logical_id FROM contracts WHERE id = $1")
                .bind(uuid)
                .fetch_optional(&state.db)
                .await
                .map_err(|err| db_internal_error("get logical_id", err))?;

        ensure_contract_exists(
            &state,
            contract_uuid,
            &id,
            "get contract for list deployments",
        )
        .await?;
        if let Some(lid) = logical_id {
            sqlx::query_scalar("SELECT id FROM contracts WHERE logical_id = $1")
                .bind(lid)
                .fetch_all(&state.db)
                .await
                .map_err(|err| db_internal_error("get contracts by logical_id", err))?
        } else {
            vec![uuid]
        }
    } else {
        // Try resolving by Stellar ID
        let uuid = dependency::resolve_contract_id(&state.db, &id)
            .await
            .map_err(|err| {
                ApiError::not_found(
                    "CONTRACT_NOT_FOUND",
                    format!("Contract {} not found: {}", id, err),
                )
            })?
            .ok_or_else(|| {
                ApiError::not_found("CONTRACT_NOT_FOUND", format!("Contract {} not found", id))
            })?;

        let logical_id: Option<Uuid> =
            sqlx::query_scalar("SELECT logical_id FROM contracts WHERE id = $1")
                .bind(uuid)
                .fetch_optional(&state.db)
                .await
                .map_err(|err| db_internal_error("get logical_id", err))?;

        if let Some(lid) = logical_id {
            sqlx::query_scalar("SELECT id FROM contracts WHERE logical_id = $1")
                .bind(lid)
                .fetch_all(&state.db)
                .await
                .map_err(|err| db_internal_error("get contracts by logical_id", err))?
        } else {
            vec![uuid]
        }
    };

    if target_uuids.is_empty() {
        return Err(ApiError::not_found(
            "CONTRACT_NOT_FOUND",
            format!("Contract {} not found", id),
        ));
    }

    // Pagination info
    let limit = params.limit.unwrap_or(20).clamp(1, 100);
    let page = params.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;

    // Cache key
    let cache_key = format!(
        "deployments:{}:{}:{}:{:?}:{:?}",
        id, page, limit, params.from_date, params.to_date
    );

    if let (Some(cached), true) = state.cache.get("contract", &cache_key).await {
        if let Ok(response) =
            serde_json::from_str::<PaginatedResponse<ContractDeploymentHistory>>(&cached)
        {
            return Ok(Json(response));
        }
    }

    // Query builder for on-chain deployments
    let mut query_builder: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        "SELECT ci.created_at as deployed_at, ci.network, ci.user_address as deployer_address, ci.transaction_hash
         FROM contract_interactions ci
         WHERE ci.contract_id = ANY("
    );
    query_builder.push_bind(&target_uuids);
    query_builder.push(") AND ci.interaction_type = cast('deploy' as text)");

    if let Some(from) = params.from_date {
        query_builder.push(" AND ci.created_at >= ");
        query_builder.push_bind(from);
    }
    if let Some(to) = params.to_date {
        query_builder.push(" AND ci.created_at <= ");
        query_builder.push_bind(to);
    }

    query_builder.push(" ORDER BY ci.created_at DESC");
    query_builder.push(" LIMIT ");
    query_builder.push_bind(limit);
    query_builder.push(" OFFSET ");
    query_builder.push_bind(offset);

    let deployments: Vec<ContractDeploymentHistory> = query_builder
        .build_query_as()
        .fetch_all(&state.db)
        .await
        .map_err(|err| db_internal_error("fetch deployment history", err))?;

    // Total count for pagination
    let mut count_builder: QueryBuilder<sqlx::Postgres> =
        QueryBuilder::new("SELECT COUNT(*) FROM contract_interactions WHERE contract_id = ANY(");
    count_builder.push_bind(&target_uuids);
    count_builder.push(") AND interaction_type = cast('deploy' as text)");

    if let Some(from) = params.from_date {
        count_builder.push(" AND created_at >= ");
        count_builder.push_bind(from);
    }
    if let Some(to) = params.to_date {
        count_builder.push(" AND created_at <= ");
        count_builder.push_bind(to);
    }

    let total: i64 = count_builder
        .build_query_scalar()
        .fetch_one(&state.db)
        .await
        .map_err(|err| db_internal_error("fetch deployment count", err))?;

    let response = PaginatedResponse::new(deployments, total, page, limit);

    // Cache the result
    if let Ok(serialized) = serde_json::to_string(&response) {
        state
            .cache
            .put(
                "contract",
                &cache_key,
                serialized,
                Some(std::time::Duration::from_secs(3600)),
            )
            .await;
    }

    Ok(Json(response))
}
