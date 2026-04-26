"use client";

import { Suspense, useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Network,
  ContractVersion,
  ContractChangelogEntry,
  VersionFieldDiff,
  VersionCompareResponse,
} from "@/lib/api";
import ExampleGallery from "@/components/ExampleGallery";
import {
  ArrowLeft,
  CheckCircle2,
  Globe,
  Tag,
  Search,
  BarChart3,
  History,
  Database,
  Code2,
  Layers,
  MessageSquare,
  GitCompare,
  Share2,
  Download,
  RotateCcw,
} from "lucide-react";

import Link from "next/link";
import { useCopy } from "@/hooks/useCopy";
import CodeCopyButton from "@/components/CodeCopyButton";
import { useParams, useSearchParams } from "next/navigation";
import { useAnalytics } from "@/hooks/useAnalytics";
import FormalVerificationPanel from "@/components/FormalVerificationPanel";
import InteractionHistorySection from "@/components/InteractionHistorySection";
import Navbar from "@/components/Navbar";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import CustomMetricsPanel from "@/components/CustomMetricsPanel";
import DeprecationBanner from "@/components/DeprecationBanner";
import ReleaseNotesPanel from "@/components/ReleaseNotesPanel";
import ContractComments from "@/components/ContractComments";
import { useToast } from "@/hooks/useToast";
import { useContractAutoRefresh } from "@/hooks/useContractAutoRefresh";
import ContractInteractionFlow from "@/components/contracts/ContractInteractionFlow";
import ContractAbiMethodExplorer from "@/components/contracts/ContractAbiMethodExplorer";

const NETWORKS: Network[] = ["mainnet", "testnet", "futurenet"];
const TAB_IDS = [
  "overview",
  "interactions",
  "abi",
  "source",
  "deployments",
  "analytics",
  "history",
  "discussion",
] as const;
type TabId = (typeof TAB_IDS)[number];

// TODO: Replace with real API call when maintenance endpoint is available
const maintenanceStatus: { is_maintenance: boolean; current_window: null } = {
  is_maintenance: false,
  current_window: null,
};

function normalizeRawSourceUrl(input: string): string {
  try {
    const url = new URL(input);
    if (url.hostname === "github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const blobIdx = parts.indexOf("blob");
      if (parts.length >= 5 && blobIdx === 2) {
        const owner = parts[0];
        const repo = parts[1];
        const branch = parts[3];
        const path = parts.slice(4).join("/");
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
      }
    }
  } catch {
    return input;
  }
  return input;
}

const RUST_KEYWORDS = new Set([
  "fn",
  "let",
  "mut",
  "pub",
  "struct",
  "enum",
  "impl",
  "trait",
  "use",
  "mod",
  "match",
  "if",
  "else",
  "for",
  "while",
  "loop",
  "return",
  "async",
  "await",
  "where",
  "crate",
  "Self",
  "self",
  "const",
  "static",
  "type",
  "move",
  "ref",
  "in",
  "as",
]);

function HighlightedRustCode({ code, query }: { code: string; query: string }) {
  const lowered = query.trim().toLowerCase();
  const filteredLines = useMemo(() => {
    const lines = code.split("\n");
    if (!lowered) return lines;
    return lines.filter((line) => line.toLowerCase().includes(lowered));
  }, [code, lowered]);

  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-card p-4 text-xs leading-6 font-mono text-foreground">
      {filteredLines.map((line, idx) => {
        const parts = line.split(/(\s+)/);
        let inComment = false;
        return (
          <div key={`${idx}-${line.slice(0, 16)}`}>
            {parts.map((token, tokenIdx) => {
              if (token.startsWith("//")) inComment = true;
              if (/^\s+$/.test(token)) {
                return <span key={tokenIdx}>{token}</span>;
              }

              const tokenWord = token.replace(/[^A-Za-z0-9_]/g, "");
              const isKeyword = RUST_KEYWORDS.has(tokenWord);
              const matchesQuery =
                lowered && token.toLowerCase().includes(lowered);

              let className = "";
              if (inComment) className = "text-emerald-400";
              else if (token.startsWith('"') || token.endsWith('"'))
                className = "text-amber-300";
              else if (isKeyword) className = "text-sky-300 font-semibold";

              if (matchesQuery) {
                return (
                  <mark
                    key={tokenIdx}
                    className={`rounded px-0.5 bg-primary/30 text-foreground ${className}`}
                  >
                    {token}
                  </mark>
                );
              }

              return (
                <span key={tokenIdx} className={className}>
                  {token}
                </span>
              );
            })}
          </div>
        );
      })}
    </pre>
  );
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function classifyVersionDifferences(
  compare: VersionCompareResponse | undefined,
) {
  const empty: VersionFieldDiff[] = [];
  if (!compare) {
    return {
      added: empty,
      removed: empty,
      modified: empty,
    };
  }

  const added = compare.differences.filter(
    (diff) => diff.from_value == null && diff.to_value != null,
  );
  const removed = compare.differences.filter(
    (diff) => diff.from_value != null && diff.to_value == null,
  );
  const modified = compare.differences.filter(
    (diff) => diff.from_value != null && diff.to_value != null,
  );

  return { added, removed, modified };
}

function ContractDetailsContent() {
  const params = useParams<{ id?: string | string[] }>() ?? {};
  const searchParams = useSearchParams();
  const idParam = params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const { copy: copyHeader, copied: copiedHeader } = useCopy();
  const { copy: copySidebar, copied: copiedSidebar } = useCopy();
  const {
    copy: copySourceCode,
    copied: copiedSourceCode,
    isCopying: isCopyingSourceCode,
  } = useCopy();
  const networkFromUrl = searchParams?.get("network") as Network | null;
  const [selectedNetwork, setSelectedNetwork] = useState<Network>(
    networkFromUrl && NETWORKS.includes(networkFromUrl)
      ? networkFromUrl
      : "mainnet",
  );
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [tabSearch, setTabSearch] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [compareFromVersion, setCompareFromVersion] = useState<string>("");
  const [rollbackAdminId, setRollbackAdminId] = useState<string>("");
  const [rollbackNotes, setRollbackNotes] = useState<string>("");
  const versionsLoadStartedAtRef = useRef<number | null>(null);
  const [versionsLoadDurationMs, setVersionsLoadDurationMs] = useState<
    number | null
  >(null);
  const queryClient = useQueryClient();
  const { showError, showInfo, showSuccess } = useToast();

  const tabMeta: Record<
    TabId,
    { label: string; icon: React.ComponentType<{ className?: string }> }
  > = {
    overview: { label: "Overview", icon: Layers },
    interactions: { label: "Interactions", icon: Share2 },
    abi: { label: "ABI", icon: Database },
    source: { label: "Source Code", icon: Code2 },
    deployments: { label: "Deployments", icon: Globe },
    analytics: { label: "Analytics", icon: BarChart3 },
    history: { label: "History", icon: History },
    discussion: { label: "Discussion", icon: MessageSquare },
  };

  // Subscribe to real-time contract updates
  useContractAutoRefresh(id);

  const {
    data: contract,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["contract", id],
    queryFn: () => api.getContract(id!),
    enabled: !!id,
  });

  useQuery({
    queryKey: ["contract-dependencies", id],
    queryFn: () => api.getContractDependencies(id!),
    enabled: !!id && !!contract && activeTab === "overview",
  });

  const { data: versions = [] } = useQuery({
    queryKey: ["contract-versions", id],
    queryFn: async () => {
      versionsLoadStartedAtRef.current = performance.now();
      return api.getContractVersions(id!);
    },
    enabled:
      !!id &&
      !!contract &&
      ["source", "deployments", "history", "abi"].includes(activeTab),
    onSuccess: () => {
      if (versionsLoadStartedAtRef.current != null) {
        setVersionsLoadDurationMs(
          performance.now() - versionsLoadStartedAtRef.current,
        );
        versionsLoadStartedAtRef.current = null;
      }
    },
    onError: () => {
      versionsLoadStartedAtRef.current = null;
      setVersionsLoadDurationMs(null);
    },
  });

  const latestVersion = useMemo(() => {
    if (!versions.length) return null;
    return [...versions].sort(
      (a: ContractVersion, b: ContractVersion) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
  }, [versions]);

  const { data: abiResponse, isLoading: abiLoading } = useQuery({
    queryKey: ["contract-abi", id, latestVersion?.version],
    queryFn: () => api.getContractAbi(id!, latestVersion?.version),
    enabled: !!id && !!contract && activeTab === "abi",
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["contract-analytics-summary", id],
    queryFn: () => api.getContractAnalytics(id!),
    enabled:
      !!id && !!contract && ["analytics", "deployments"].includes(activeTab),
  });

  const { data: changelog } = useQuery({
    queryKey: ["contract-changelog", id],
    queryFn: () => api.getContractChangelog(id!),
    enabled: !!id && !!contract && activeTab === "history",
  });

  const sourceUrl = latestVersion?.source_url;
  const sourceQueryUrl = sourceUrl
    ? normalizeRawSourceUrl(sourceUrl)
    : undefined;
  const {
    data: sourceCode,
    isLoading: sourceLoading,
    error: sourceError,
  } = useQuery({
    queryKey: ["contract-source", id, sourceQueryUrl],
    queryFn: async () => {
      if (!sourceQueryUrl) return "";
      const res = await fetch(sourceQueryUrl);
      if (!res.ok) throw new Error("Unable to fetch source from source_url");
      return res.text();
    },
    enabled: !!id && !!contract && activeTab === "source" && !!sourceQueryUrl,
  });

  const loweredSearch = tabSearch.trim().toLowerCase();
  const filteredVersions = useMemo(() => {
    if (!loweredSearch) return versions;
    return versions.filter((version) =>
      [
        version.version,
        version.wasm_hash,
        version.commit_hash,
        version.release_notes,
        version.source_url,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(loweredSearch)),
    );
  }, [versions, loweredSearch]);

  const sortedVersions = useMemo(() => {
    return [...filteredVersions].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [filteredVersions]);

  const selectedVersion = useMemo(() => {
    if (!sortedVersions.length) return null;
    return (
      sortedVersions.find((version) => version.id === selectedVersionId) ??
      sortedVersions[0]
    );
  }, [sortedVersions, selectedVersionId]);

  const defaultCompareFromVersion = useMemo(() => {
    if (!selectedVersion || !sortedVersions.length) return "";
    const selectedIndex = sortedVersions.findIndex(
      (version) => version.id === selectedVersion.id,
    );
    const olderVersion =
      selectedIndex >= 0 ? sortedVersions[selectedIndex + 1] : undefined;
    if (olderVersion) return olderVersion.version;

    const fallback = sortedVersions.find(
      (version) => version.version !== selectedVersion.version,
    );
    return fallback?.version ?? "";
  }, [selectedVersion, sortedVersions]);

  const effectiveCompareFromVersion = useMemo(() => {
    if (!selectedVersion) return "";
    if (compareFromVersion && compareFromVersion !== selectedVersion.version) {
      return compareFromVersion;
    }
    return defaultCompareFromVersion;
  }, [compareFromVersion, defaultCompareFromVersion, selectedVersion]);

  const { data: versionComparison, isLoading: comparisonLoading } = useQuery({
    queryKey: [
      "contract-version-compare",
      id,
      effectiveCompareFromVersion,
      selectedVersion?.version,
    ],
    queryFn: () =>
      api.compareContractVersions(
        id!,
        effectiveCompareFromVersion,
        selectedVersion!.version,
      ),
    enabled:
      !!id &&
      activeTab === "history" &&
      !!selectedVersion?.version &&
      !!effectiveCompareFromVersion &&
      effectiveCompareFromVersion !== selectedVersion.version,
  });

  const rollbackMutation = useMutation({
    mutationFn: () =>
      api.revertContractVersion(id!, selectedVersion!.version, {
        admin_id: rollbackAdminId.trim(),
        change_notes: rollbackNotes.trim() || undefined,
      }),
    onSuccess: (newVersion) => {
      showSuccess(
        `Rollback successful. New version ${newVersion.version} created.`,
      );
      queryClient.invalidateQueries({ queryKey: ["contract-versions", id] });
      queryClient.invalidateQueries({ queryKey: ["contract-changelog", id] });
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
      setRollbackNotes("");
      setSelectedVersionId(newVersion.id);
    },
    onError: (mutationError) => {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Rollback failed";
      showError(message);
    },
  });

  const filteredHistory = useMemo(() => {
    const entries = changelog?.entries ?? [];
    if (!loweredSearch) return entries;
    return entries.filter((entry: ContractChangelogEntry) =>
      [
        entry.version,
        entry.commit_hash,
        entry.release_notes,
        entry.source_url,
        ...entry.breaking_changes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(loweredSearch)),
    );
  }, [changelog, loweredSearch]);

  const { logEvent } = useAnalytics();

  useEffect(() => {
    if (!error) return;
    logEvent("error_event", {
      source: "contract_details",
      contract_id: id,
      message: "Failed to load contract details",
    });
  }, [error, id, logEvent]);

  const { data: deprecationInfo } = useQuery({
    queryKey: ["contract-deprecation", id],
    queryFn: () => api.getDeprecationInfo(id!),
    enabled: !!id && !!contract,
  });

  const diffSummary = useMemo(
    () => classifyVersionDifferences(versionComparison),
    [versionComparison],
  );

  const selectedHistoryEntry = useMemo(() => {
    if (!selectedVersion) return null;
    return (
      (changelog?.entries ?? []).find(
        (entry) => entry.version === selectedVersion.version,
      ) ?? null
    );
  }, [changelog?.entries, selectedVersion]);

  const versionsLoadBadge = useMemo(() => {
    if (versionsLoadDurationMs == null) {
      return null;
    }

    const rounded = Math.max(0, Math.round(versionsLoadDurationMs));
    const underBudget = rounded < 1000;

    return {
      label: `${rounded}ms`,
      tone: underBudget
        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
        : "bg-amber-500/10 text-amber-700 border-amber-500/20",
      note: underBudget ? "under 1s" : "over 1s",
    };
  }, [versionsLoadDurationMs]);

  const exportVersionSnapshot = () => {
    if (!selectedVersion) {
      showInfo("Select a version before exporting a snapshot.");
      return;
    }

    const payload = {
      exported_at: new Date().toISOString(),
      contract: {
        id: contract.id,
        contract_id: displayContractId,
        name: contract.name,
        network: selectedNetwork,
      },
      selected_version: selectedVersion,
      changelog_entry: selectedHistoryEntry,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${contract.name.replace(/\s+/g, "-").toLowerCase()}-v${selectedVersion.version}-snapshot.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showSuccess(`Snapshot for version ${selectedVersion.version} exported.`);
  };

  const handleRollback = () => {
    if (!selectedVersion) {
      showInfo("Select a target version before rollback.");
      return;
    }

    if (!isValidUuid(rollbackAdminId.trim())) {
      showInfo("Enter a valid admin UUID to authorize rollback.");
      return;
    }

    const confirmed = window.confirm(
      `Rollback to version ${selectedVersion.version}? This creates a new revert version and writes an audit log.`,
    );
    if (!confirmed) return;

    rollbackMutation.mutate();
  };

  if (!id) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-10">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-sm font-semibold text-foreground">
              Missing contract id
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Open this page from the contracts list.
            </div>
            <div className="mt-4">
              <Link
                href="/contracts"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Browse contracts
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="animate-pulse space-y-8">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl">
          Failed to load contract details
        </div>
      </div>
    );
  }

  const configForNetwork = contract.network_configs?.[selectedNetwork];
  const displayContractId =
    configForNetwork?.contract_id ?? contract.contract_id;
  const displayVerified = configForNetwork?.is_verified ?? contract.is_verified;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
      <Link
        href="/contracts"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to contracts
      </Link>

      {/* Maintenance Banner */}
      {maintenanceStatus?.is_maintenance &&
        maintenanceStatus.current_window && (
          <MaintenanceBanner window={maintenanceStatus.current_window} />
        )}

      {/* Deprecation Banner */}
      {deprecationInfo && <DeprecationBanner info={deprecationInfo} />}

      {/* Header */}
      <div className="mb-12">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">
              {contract.name}
            </h1>
            <div className="flex items-center gap-3 text-muted-foreground">
              <span className="flex items-center gap-2 font-mono bg-accent px-2 py-1 rounded-lg text-sm">
                <span>{displayContractId}</span>
                <CodeCopyButton
                  copied={copiedHeader}
                  onCopy={() =>
                    copyHeader(displayContractId, {
                      successEventName: "contract_address_copied",
                      failureEventName: "contract_address_copy_failed",
                      successMessage: "Contract address copied",
                      failureMessage: "Unable to copy contract address",
                      analyticsParams: {
                        contract_id: contract.id,
                        location: "header",
                      },
                    })
                  }
                  idleLabel="Copy"
                  copiedLabel="Copied"
                />
              </span>
              {displayVerified && (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Verified
                </span>
              )}
            </div>
          </div>

          {/* Network tabs (Issue #43) */}
          <div className="flex gap-1 p-1 bg-accent rounded-xl w-fit">
            {NETWORKS.map((net) => {
              const hasConfig = !!contract.network_configs?.[net];
              return (
                <button
                  key={net}
                  type="button"
                  onClick={() => setSelectedNetwork(net)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                    selectedNetwork === net
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  } ${!hasConfig ? "opacity-60" : ""}`}
                >
                  {net}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Link
              href={`/compare?contracts=${contract.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <GitCompare className="h-4 w-4" />
              Compare
            </Link>
            <Link
              href={`/contracts/${id}/compatibility`}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <GitCompare className="h-4 w-4" />
              Interoperability
            </Link>
          </div>
        </div>

        {contract.description && (
          <p className="text-xl text-muted-foreground max-w-3xl mb-6">
            {contract.description}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {contract.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium"
            >
              <Tag className="w-3 h-3" />
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        <div className="md:hidden">
          <label className="sr-only" htmlFor="contract-tab-select">
            Contract tab
          </label>
          <select
            id="contract-tab-select"
            className="w-full rounded-xl border border-border bg-card p-3 text-sm text-foreground"
            value={activeTab}
            onChange={(e) => {
              setActiveTab(e.target.value as TabId);
              setTabSearch("");
            }}
          >
            {TAB_IDS.map((tabId) => (
              <option key={tabId} value={tabId}>
                {tabMeta[tabId].label}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden md:flex flex-wrap gap-2 p-2 rounded-2xl border border-border bg-card">
          {TAB_IDS.map((tabId) => {
            const Icon = tabMeta[tabId].icon;
            return (
              <button
                key={tabId}
                type="button"
                onClick={() => {
                  setActiveTab(tabId);
                  setTabSearch("");
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tabId
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tabMeta[tabId].label}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            value={tabSearch}
            onChange={(e) => setTabSearch(e.target.value)}
            placeholder={`Search in ${tabMeta[activeTab].label}`}
            className="w-full rounded-xl border border-border bg-card pl-10 pr-3 py-2.5 text-sm text-foreground"
          />
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <section>
                <ExampleGallery contractId={contract.id} />
              </section>
            </div>

            <div className="space-y-6">
              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="font-semibold text-foreground mb-4">Key Info</h3>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Network</dt>
                    <dd className="font-medium text-foreground capitalize">
                      {selectedNetwork}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Address</dt>
                    <dd className="flex items-center justify-between gap-2 font-mono text-xs text-foreground break-all">
                      <span>{displayContractId}</span>
                      <CodeCopyButton
                        copied={copiedSidebar}
                        onCopy={() =>
                          copySidebar(displayContractId, {
                            successEventName: "contract_address_copied",
                            failureEventName: "contract_address_copy_failed",
                            successMessage: "Contract address copied",
                            failureMessage: "Unable to copy contract address",
                            analyticsParams: {
                              contract_id: contract.id,
                              location: "sidebar",
                            },
                          })
                        }
                        idleLabel="Copy"
                        copiedLabel="Copied"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Published</dt>
                    <dd className="font-medium text-foreground">
                      {new Date(contract.created_at).toLocaleDateString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last Updated</dt>
                    <dd className="font-medium text-foreground">
                      {new Date(contract.updated_at).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>
              </div>

              <Link
                href={`/contracts/${contract.id}/api-docs`}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 text-muted-foreground hover:text-primary transition-all group"
              >
                <Globe className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <div>
                  <div className="text-sm font-medium">API Docs</div>
                  <div className="text-xs text-muted-foreground">
                    OpenAPI / Swagger UI
                  </div>
                </div>
              </Link>

              <FormalVerificationPanel contractId={contract.id} />
            </div>
          </div>
        )}

        {activeTab === "interactions" && (
          <div className="space-y-6">
            <section className="bg-card rounded-2xl border border-border p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold text-foreground">
                  Interaction Flow Diagram
                </h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-3 h-3 rounded-full bg-primary/20 border border-primary/50" />
                  <span>Interactive Flow</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Explore the cross-contract call graph centered on this contract.
                Zoom, pan, and filter to understand complex relationships.
              </p>
              <ContractInteractionFlow contractId={id} />
            </section>
          </div>
        )}

        {activeTab === "abi" && (
          <section className="bg-card rounded-2xl border border-border p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  ABI Method Explorer
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Browse contract methods, input parameters, simulate calls, and
                  copy SDK snippets.
                </p>
              </div>
              {abiResponse?.abi != null && (
                <details className="flex-shrink-0">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none">
                    View raw JSON
                  </summary>
                  <div className="absolute right-6 z-20 mt-2 w-[min(600px,90vw)] max-h-96 overflow-auto rounded-xl border border-border bg-zinc-950 p-4 shadow-2xl">
                    <pre className="text-[11px] leading-5 text-zinc-300 font-mono">
                      {JSON.stringify(abiResponse.abi, null, 2)}
                    </pre>
                  </div>
                </details>
              )}
            </div>

            {abiLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse bg-muted rounded-xl"
                  />
                ))}
              </div>
            ) : (
              <ContractAbiMethodExplorer
                abi={abiResponse?.abi}
                contractId={displayContractId}
              />
            )}
          </section>
        )}

        {activeTab === "source" && (
          <section className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-foreground">
                Source Code
              </h2>
              <div className="flex items-center gap-2">
                {sourceCode && (
                  <CodeCopyButton
                    onCopy={() =>
                      copySourceCode(sourceCode, {
                        successEventName: "contract_source_code_copied",
                        failureEventName: "contract_source_code_copy_failed",
                        successMessage: "Contract code copied",
                        failureMessage: "Unable to copy contract code",
                        analyticsParams: {
                          contract_id: contract.id,
                          tab: "source",
                        },
                      })
                    }
                    copied={copiedSourceCode}
                    disabled={isCopyingSourceCode}
                    idleLabel="Copy Code"
                    copiedLabel="Copied"
                  />
                )}
                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Open Source URL
                  </a>
                )}
              </div>
            </div>

            {!sourceUrl && (
              <p className="text-sm text-muted-foreground">
                No source URL available for the latest version.
              </p>
            )}

            {sourceLoading && (
              <div className="h-64 animate-pulse bg-muted rounded" />
            )}
            {sourceError && (
              <p className="text-sm text-amber-500">
                Unable to fetch source code from remote URL. You can still open
                the source URL directly.
              </p>
            )}
            {sourceCode && (
              <HighlightedRustCode code={sourceCode} query={tabSearch} />
            )}
          </section>
        )}

        {activeTab === "deployments" && (
          <section className="bg-card rounded-2xl border border-border p-6 space-y-6">
            <h2 className="text-xl font-semibold text-foreground">
              Deployments
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border p-4 bg-background">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Total deployments
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {analyticsData?.deployments.count ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-border p-4 bg-background">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Unique users
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {analyticsData?.deployments.unique_users ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-border p-4 bg-background">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Versions
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {versions.length}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Deployment Timeline
              </h3>
              <div className="space-y-3">
                {filteredVersions.map((version) => (
                  <div
                    key={version.id}
                    className="rounded-xl border border-border p-4 bg-background"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-foreground">
                        v{version.version}
                      </p>
                      <time className="text-xs text-muted-foreground">
                        {new Date(version.created_at).toLocaleString()}
                      </time>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                      {version.wasm_hash}
                    </p>
                    {version.release_notes && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {version.release_notes}
                      </p>
                    )}
                  </div>
                ))}
                {filteredVersions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No deployment timeline entries match this search.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-6">
            <section className="bg-card rounded-2xl border border-border p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">
                Usage Analytics
              </h2>
              <p className="text-sm text-muted-foreground">
                Use the filters inside the analytics tables and charts below to
                search account and method activity.
              </p>
            </section>
            <InteractionHistorySection contractId={contract.id} />
            <CustomMetricsPanel contractId={contract.id} />
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-6">
            <section className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-foreground">
                  Version History
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {versionsLoadBadge && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold ${versionsLoadBadge.tone}`}
                    >
                      Loaded in {versionsLoadBadge.label} (
                      {versionsLoadBadge.note})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={exportVersionSnapshot}
                    disabled={!selectedVersion}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <Download size={14} />
                    Export snapshot
                  </button>
                  <Link
                    href={`/contracts/${id}/diff`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <GitCompare size={14} />
                    Full code diff
                  </Link>
                </div>
              </div>

              <div className="overflow-x-auto pb-2">
                <div className="flex min-w-max gap-3">
                  {sortedVersions.map((version) => {
                    const selected = version.id === selectedVersion?.id;
                    return (
                      <button
                        key={version.id}
                        type="button"
                        onClick={() => setSelectedVersionId(version.id)}
                        className={`w-56 rounded-xl border p-3 text-left transition-colors ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:bg-accent"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">
                            v{version.version}
                          </span>
                          {version.is_revert && (
                            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                              revert
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(version.created_at).toLocaleDateString()}
                        </p>
                        <p className="mt-2 line-clamp-2 font-mono text-[11px] text-muted-foreground break-all">
                          {version.wasm_hash}
                        </p>
                      </button>
                    );
                  })}
                  {sortedVersions.length === 0 && (
                    <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                      No versions match this search.
                    </div>
                  )}
                </div>
              </div>

              {selectedVersion && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <article className="rounded-xl border border-border bg-background p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Selected Version State
                    </h3>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Version</dt>
                        <dd className="font-semibold text-foreground">
                          v{selectedVersion.version}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">WASM hash</dt>
                        <dd className="font-mono text-foreground break-all">
                          {selectedVersion.wasm_hash}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Commit hash</dt>
                        <dd className="font-mono text-foreground break-all">
                          {selectedVersion.commit_hash ?? "N/A"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Source URL</dt>
                        <dd className="break-all text-foreground">
                          {selectedVersion.source_url ? (
                            <a
                              href={selectedVersion.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              {selectedVersion.source_url}
                            </a>
                          ) : (
                            "N/A"
                          )}
                        </dd>
                      </div>
                    </dl>
                    {(selectedVersion.release_notes ||
                      selectedVersion.change_notes) && (
                      <div className="mt-3 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
                        {selectedVersion.release_notes && (
                          <p className="mb-2">
                            {selectedVersion.release_notes}
                          </p>
                        )}
                        {selectedVersion.change_notes && (
                          <p className="text-foreground/80">
                            {selectedVersion.change_notes}
                          </p>
                        )}
                      </div>
                    )}
                  </article>

                  <article className="rounded-xl border border-border bg-background p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        Version Diff
                      </h3>
                      <div className="flex items-center gap-2 text-xs">
                        <label
                          className="text-muted-foreground"
                          htmlFor="compare-from-select"
                        >
                          Compare from
                        </label>
                        <select
                          id="compare-from-select"
                          value={effectiveCompareFromVersion}
                          onChange={(event) =>
                            setCompareFromVersion(event.target.value)
                          }
                          className="rounded-lg border border-border bg-card px-2 py-1 text-foreground"
                        >
                          <option value="">Select base version</option>
                          {sortedVersions
                            .filter(
                              (version) =>
                                version.version !== selectedVersion.version,
                            )
                            .map((version) => (
                              <option
                                key={`base-${version.id}`}
                                value={version.version}
                              >
                                v{version.version}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {comparisonLoading && (
                      <div className="h-24 animate-pulse rounded-lg bg-muted" />
                    )}

                    {!comparisonLoading &&
                      effectiveCompareFromVersion === "" && (
                        <p className="text-xs text-muted-foreground">
                          Select a base version to render a diff.
                        </p>
                      )}

                    {!comparisonLoading &&
                      effectiveCompareFromVersion !== "" &&
                      versionComparison && (
                        <div className="space-y-3 text-xs">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-lg bg-green-500/10 p-2 text-green-700">
                              + Added: {diffSummary.added.length}
                            </div>
                            <div className="rounded-lg bg-red-500/10 p-2 text-red-700">
                              - Removed: {diffSummary.removed.length}
                            </div>
                            <div className="rounded-lg bg-amber-500/15 p-2 text-amber-700">
                              ~ Modified: {diffSummary.modified.length}
                            </div>
                          </div>

                          <div className="max-h-64 space-y-2 overflow-auto pr-1">
                            {diffSummary.added.map((change) => (
                              <div
                                key={`add-${change.field}`}
                                className="rounded-lg border border-green-500/20 bg-green-500/5 p-2"
                              >
                                <div className="font-semibold text-green-700">
                                  {change.field}
                                </div>
                                <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-green-900/80">
                                  {JSON.stringify(change.to_value, null, 2)}
                                </pre>
                              </div>
                            ))}

                            {diffSummary.removed.map((change) => (
                              <div
                                key={`remove-${change.field}`}
                                className="rounded-lg border border-red-500/20 bg-red-500/5 p-2"
                              >
                                <div className="font-semibold text-red-700">
                                  {change.field}
                                </div>
                                <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-red-900/80">
                                  {JSON.stringify(change.from_value, null, 2)}
                                </pre>
                              </div>
                            ))}

                            {diffSummary.modified.map((change) => (
                              <div
                                key={`modify-${change.field}`}
                                className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2"
                              >
                                <div className="font-semibold text-amber-700">
                                  {change.field}
                                </div>
                                <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-2">
                                  <pre className="rounded bg-background p-2 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                                    {JSON.stringify(change.from_value, null, 2)}
                                  </pre>
                                  <pre className="rounded bg-background p-2 whitespace-pre-wrap break-words text-[11px] text-foreground">
                                    {JSON.stringify(change.to_value, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            ))}

                            {versionComparison.differences.length === 0 && (
                              <p className="text-muted-foreground">
                                No field-level differences between selected
                                versions.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                  </article>
                </div>
              )}

              <article className="rounded-xl border border-border bg-background p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Rollback
                  </h3>
                  {selectedVersion && (
                    <span className="text-xs text-muted-foreground">
                      Target: v{selectedVersion.version}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Creates a new revert version from the selected historical
                  version and records an audit event.
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    type="text"
                    value={rollbackAdminId}
                    onChange={(event) => setRollbackAdminId(event.target.value)}
                    placeholder="Admin UUID (required)"
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                  <input
                    type="text"
                    value={rollbackNotes}
                    onChange={(event) => setRollbackNotes(event.target.value)}
                    placeholder="Rollback notes (optional)"
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRollback}
                  disabled={!selectedVersion || rollbackMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  {rollbackMutation.isPending
                    ? "Rolling back..."
                    : "Rollback to selected version"}
                </button>
              </article>

              <article className="rounded-xl border border-dashed border-border bg-background p-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Version Comments
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Future enhancement: threaded comments on each version for
                  release review and change approvals.
                </p>
              </article>

              <div className="space-y-3">
                {filteredHistory.map((entry: ContractChangelogEntry) => (
                  <article
                    key={`${entry.version}-${entry.created_at}`}
                    className="rounded-xl border border-border p-4 bg-background"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <p className="font-semibold text-foreground">
                        v{entry.version}
                      </p>
                      <time className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </time>
                    </div>
                    {entry.release_notes && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {entry.release_notes}
                      </p>
                    )}
                    {entry.breaking && (
                      <div className="rounded-lg bg-red-500/10 text-red-500 px-3 py-2 text-xs">
                        Breaking changes detected
                      </div>
                    )}
                    {entry.breaking_changes.length > 0 && (
                      <ul className="mt-2 list-disc ml-4 text-xs text-muted-foreground space-y-1">
                        {entry.breaking_changes.map((change) => (
                          <li key={change}>{change}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
                {filteredHistory.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No history entries match this search.
                  </p>
                )}
              </div>
            </section>
            <ReleaseNotesPanel contractId={contract.id} />
          </div>
        )}

        {activeTab === "discussion" && (
          <section className="bg-card rounded-2xl border border-border p-6">
            <ContractComments contractId={contract.id} />
          </section>
        )}
      </div>
    </div>
  );
}

export default function ContractPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <Suspense fallback={null}>
        <ContractDetailsContent />
      </Suspense>
    </div>
  );
}
