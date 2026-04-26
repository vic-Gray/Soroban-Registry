#![cfg(test)]

use super::*;
use soroban_sdk::{Env, symbol_short};

#[test]
fn test_hello() {
    let env = Env::default();
    let contract_id = env.register_contract(None, HelloContract);
    let client = HelloContractClient::new(&env, &contract_id);
    assert_eq!(client.hello(&symbol_short!("Dev")), symbol_short!("Hello"));
}