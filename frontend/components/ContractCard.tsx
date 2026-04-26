import type { Contract } from '@/lib/api';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Layers3,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useCopy } from '@/hooks/useCopy';
import { formatContractId } from '@/lib/utils/formatting';
import { useTranslation } from '@/lib/i18n/client';
import VerificationBadge from '@/components/verification/VerificationBadge';
import HealthWidget from './HealthWidget';
import ContractQuickViewModal from './contracts/ContractQuickViewModal';
import FavoriteButton from './FavoriteButton';

interface ContractCardProps {
  contract: Contract;
}

export default function ContractCard({ contract }: ContractCardProps) {
  const { t } = useTranslation('common');
  const { logEvent } = useAnalytics();
  const router = useRouter();
  const { copy, copied, isCopying } = useCopy();
  const [quickViewOpen, setQuickViewOpen] = React.useState(false);

  const networkColors = {
    mainnet: 'bg-green-500/10 text-green-600 border-green-500/20',
    testnet: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    futurenet: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  };
  const networkDots = {
    mainnet: 'bg-green-500',
    testnet: 'bg-blue-500',
    futurenet: 'bg-purple-500',
  };

  const address = formatContractId(contract.contract_id);
  const categoryLabel = contract.category || 'uncategorized';
  const deploymentCount =
    typeof (contract as Contract & { deployment_count?: number }).deployment_count === 'number'
      ? (contract as Contract & { deployment_count?: number }).deployment_count
      : typeof (contract as Contract & { deployments?: number }).deployments === 'number'
        ? (contract as Contract & { deployments?: number }).deployments
        : '—';

  const handleViewDetails = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    router.push(`/contracts/${contract.id}`);
  };

  const handleOpenQuickView = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setQuickViewOpen(true);
    logEvent('contract_quick_view_opened', {
      contract_id: contract.id,
      contract_name: contract.name,
      network: contract.network,
    });
  };

  const copyAddress = async () => {
    await copy(contract.contract_id, {
      successEventName: 'contract_address_copied',
      failureEventName: 'contract_address_copy_failed',
      successMessage: 'Contract address copied',
      failureMessage: 'Unable to copy contract address',
      analyticsParams: {
        contract_id: contract.id,
        contract_name: contract.name,
      },
    });
  };

  const handleCopyAddress = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await copyAddress();
  };

  return (
    <>
      <Link
        href={`/contracts/${contract.id}`}
        onClick={() =>
          logEvent('contract_viewed', {
            contract_id: contract.id,
            contract_name: contract.name,
            network: contract.network,
          })
        }
      >
        <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-card transition-all card-hover glow-border gradient-border-card">
          <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-secondary/5 opacity-0 transition-opacity group-hover:opacity-100" />

          <div className="relative flex h-full flex-col p-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="truncate text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                    {contract.name}
                  </h3>
                  {contract.is_verified && <VerificationBadge status="approved" />}
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {address}
                </p>
              </div>

              <span
                className={`ml-3 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${networkColors[contract.network]}`}
              >
                <span className={`h-2 w-2 rounded-full ${networkDots[contract.network]}`} />
                {contract.network}
              </span>
            </div>

            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="inline-flex max-w-[60%] items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Tag className="h-3 w-3 shrink-0" />
                <span className="truncate">{categoryLabel}</span>
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  contract.is_verified
                    ? 'bg-green-500/10 text-green-500 border-green-500/20'
                    : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                }`}
              >
                <CheckCircle2 className="h-3 w-3" />
                {contract.is_verified ? t('contractCard.verified') : t('contractCard.pending')}
              </span>
            </div>

            {contract.description && (
              <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {contract.description}
              </p>
            )}

            <div className="mb-4 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="flex items-center gap-1.5">
                <Layers3 className="h-3.5 w-3.5" />
                <span>{t('contractCard.deployments')}: {deploymentCount}</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {t('contractCard.updated')}: {new Date(contract.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            <p className="mb-4 truncate font-mono text-xs text-muted-foreground">{address}</p>

            <div className="mb-4" onClick={(event: React.MouseEvent) => event.preventDefault()}>
              <HealthWidget contract={contract} />
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={handleOpenQuickView}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>{t('contractCard.quickView')}</span>
              </button>
              <button
                type="button"
                onClick={handleViewDetails}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <span>{t('contractCard.viewDetails')}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCopyAddress}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
                    event.preventDefault();
                    event.stopPropagation();
                    void copyAddress();
                  }
                }}
                disabled={isCopying}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? t('contractCard.copied') : t('contractCard.copyAddress')}</span>
              </button>
              <FavoriteButton contractId={contract.id} size="sm" />
            </div>
          </div>
        </div>
      </Link>

      <ContractQuickViewModal
        contract={contract}
        isOpen={quickViewOpen}
        onClose={() => setQuickViewOpen(false)}
      />
    </>
  );
}

