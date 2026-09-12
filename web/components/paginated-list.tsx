'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Search,
  SlidersHorizontal,
  Tag,
  UserRound,
  CircleCheck,
  Layers,
  AlertCircle,
  X,
  ChevronDown,
} from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import {
  asListRecord,
  listFacetFields,
  listFilterLabel,
  listNeedsAttention,
  listSearchText,
} from '@/lib/list-filters';

export type ListRemoval = {
  remove: (ids: string[]) => Promise<boolean>;
  description: string;
  disabled?: boolean;
  individual?: boolean;
  hiddenIds?: string[];
  canRemove?: (record: Record<string, unknown>) => boolean;
};
export const ListRemovalContext = createContext<
  Record<string, ListRemoval | undefined>
>({});

export function PaginatedList({
  children,
  records,
  label,
  pageSize = 6,
  resetKey = '',
  layout = 'block',
  resultsHeading,
  removal,
}: {
  children: ReactNode;
  records?: readonly unknown[];
  label: string;
  pageSize?: number;
  resetKey?: string;
  layout?: 'block' | 'list' | 'table';
  resultsHeading?: string;
  removal?: ListRemoval;
}) {
  const inherited = useContext(ListRemovalContext)[label];
  const actions = removal || inherited;
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const allItems = Children.toArray(children);
  const [filters, setFilters] = useState({
    key: resetKey,
    query: '',
    facets: {} as Record<string, string>,
    attention: false,
  });
  const [selection, setSelection] = useState({ page: 0, key: '' });
  if (filters.key !== resetKey)
    setFilters({ key: resetKey, query: '', facets: {}, attention: false });
  const current =
    filters.key === resetKey
      ? filters
      : { key: resetKey, query: '', facets: {}, attention: false };
  const data =
    records && records.length === allItems.length ? records : undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const visibleData = data?.filter(
    (record) => !actions?.hiddenIds?.includes(String(asListRecord(record).id)),
  );
  const visibleCount = visibleData?.length ?? allItems.length;
  const facets = listFacetFields
    .map(([key, title]) => ({
      key,
      title,
      values: [
        ...new Set(
          visibleData
            ?.map((item) => asListRecord(item)[key])
            .filter(
              (value): value is string =>
                typeof value === 'string' && value !== '',
            ) || [],
        ),
      ].sort(),
    }))
    .filter(
      (facet) =>
        facet.values.length > 1 ||
        (['source', 'contributor'].includes(facet.key) &&
          facet.values.length > 0 &&
          data?.some((item) => !asListRecord(item)[facet.key])),
    )
    .filter(
      (facet, index) =>
        index < 3 || facet.key === 'source' || facet.key === 'contributor',
    );
  const attentionCount =
    visibleData?.filter((record) => listNeedsAttention(record, now)).length ||
    0;
  const active = Boolean(
    current.query ||
    current.attention ||
    Object.values(current.facets).some(Boolean),
  );
  const indices = allItems
    .map((_, index) => index)
    .filter(
      (index) =>
        !data ||
        (!actions?.hiddenIds?.includes(String(asListRecord(data[index]).id)) &&
          (!current.query.trim() ||
            listSearchText(data[index]).includes(
              current.query.trim().toLocaleLowerCase(),
            )) &&
          (!current.attention || listNeedsAttention(data[index], now)) &&
          Object.entries(current.facets).every(
            ([key, value]) =>
              !value || asListRecord(data[index])[key] === value,
          )),
    );
  const items = indices.map((index) => allItems[index]);
  const ids =
    data
      ?.filter(
        (record) =>
          !actions?.hiddenIds?.includes(String(asListRecord(record).id)) &&
          (!actions?.canRemove || actions.canRemove(asListRecord(record))),
      )
      .map((record) => {
        const id = asListRecord(record).id;
        return typeof id === 'string' ? id : '';
      }) || [];
  const canRemove = actions && data && ids.every(Boolean);
  const removeControls = canRemove && (
    <div className="col-span-full flex flex-wrap items-center justify-between gap-3 p-3">
      <p className="text-xs text-muted-foreground">{actions.description}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Clear all ${label.toLocaleLowerCase()} (${ids.length})`}
        disabled={actions.disabled || removing || !ids.length}
        onClick={() => {
          setRemoveError('');
          setConfirm(ids);
        }}
      >
        Clear all ({ids.length})
      </Button>
    </div>
  );
  const confirmation = (
    <Dialog
      open={Boolean(confirm)}
      onOpenChange={(open) => {
        if (!open && !removing) setConfirm(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {confirm?.length === 1
              ? 'Remove this item?'
              : `Clear all ${confirm?.length || 0} items?`}
          </DialogTitle>
          <DialogDescription>
            {actions?.description} Clear all includes every page and items
            hidden by filters. Only eligible items are included.
          </DialogDescription>
        </DialogHeader>
        {removeError && (
          <p role="alert" className="text-sm text-destructive">
            {removeError}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={removing}
            onClick={() => setConfirm(null)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={removing || actions?.disabled}
            onClick={async () => {
              if (!confirm || !actions) return;
              setRemoving(true);
              try {
                if (await actions.remove(confirm)) setConfirm(null);
                else
                  setRemoveError(
                    'Unable to remove these items. Refresh and try again.',
                  );
              } catch (error) {
                setRemoveError(
                  error instanceof Error
                    ? error.message
                    : 'Unable to remove these items.',
                );
              } finally {
                setRemoving(false);
              }
            }}
          >
            {removing
              ? 'Removing…'
              : confirm?.length === 1
                ? 'Remove item'
                : 'Clear all'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  const pageKey = JSON.stringify([
    resetKey,
    current.query,
    current.facets,
    current.attention,
  ]);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page =
    selection.key === pageKey ? Math.min(selection.page, pages - 1) : 0;
  if (selection.key !== pageKey || selection.page !== page)
    setSelection({ page, key: pageKey });
  const wrap = (content: ReactNode) =>
    layout === 'table' ? (
      <tr>
        <td colSpan={20}>{content}</td>
      </tr>
    ) : layout === 'list' ? (
      <li className="list-none">{content}</li>
    ) : (
      content
    );
  const controls = data && (data.length > 0 || active) && (
    <fieldset
      aria-label={`Filter ${label}`}
      className="care-filters col-span-full min-w-0 space-y-3 rounded-2xl border bg-card p-4"
    >
      <legend className="sr-only">Filter {label.toLocaleLowerCase()}</legend>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal aria-hidden="true" className="size-4 text-primary" />
        Find in {label.toLocaleLowerCase()}
      </p>
      <div className="grid min-w-0 gap-3">
        <label className="grid min-w-0 gap-1.5 text-xs">
          Search {label.toLocaleLowerCase()}
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"
            />
            <Input
              type="search"
              value={current.query}
              onChange={(event) =>
                setFilters({ ...current, query: event.target.value })
              }
              placeholder="Search this list…"
              className="min-w-0 bg-background pl-9"
            />
          </span>
        </label>
        <div className="care-filter-grid">
          {facets.map((facet) => {
            const Icon =
              facet.key === 'category'
                ? Tag
                : ['owner', 'contributor'].includes(facet.key)
                  ? UserRound
                  : facet.key === 'status'
                    ? CircleCheck
                    : Layers;
            return (
              <label key={facet.key} className="grid min-w-0 gap-1.5 text-xs">
                {facet.title}
                <span
                  className="care-filter-select relative block"
                  data-active={Boolean(current.facets[facet.key])}
                >
                  <Icon
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-3.5 size-4"
                  />
                  <select
                    value={current.facets[facet.key] || ''}
                    onChange={(event) =>
                      setFilters({
                        ...current,
                        facets: {
                          ...current.facets,
                          [facet.key]: event.target.value,
                        },
                      })
                    }
                    className="h-11 w-full min-w-0 appearance-none rounded-xl border border-input bg-transparent pl-9 pr-8 text-sm"
                  >
                    <option value="">
                      Any {facet.title.toLocaleLowerCase()}
                    </option>
                    {facet.values.map((value) => (
                      <option key={value} value={value}>
                        {listFilterLabel(value)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2.5 top-4 size-3.5"
                  />
                </span>
              </label>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {(attentionCount > 0 || current.attention) && (
            <label className="care-attention-filter flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={current.attention}
                onChange={(event) =>
                  setFilters({ ...current, attention: event.target.checked })
                }
              />
              <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
              <span>Needs attention only ({attentionCount})</span>
            </label>
          )}
          {active && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setFilters({
                  key: resetKey,
                  query: '',
                  facets: {},
                  attention: false,
                })
              }
            >
              <X aria-hidden="true" />
              Clear filters
            </Button>
          )}
        </div>
      </div>
      {active && (
        <output className="block text-xs text-muted-foreground">
          {items.length} matching of {visibleCount}
        </output>
      )}
    </fieldset>
  );
  const navigation = items.length > pageSize && (
    <nav
      aria-label={`${label} pagination`}
      className="col-span-full flex flex-wrap items-center justify-between gap-3 border-t px-3 py-4 text-sm"
    >
      <span aria-live="polite">
        {page * pageSize + 1}–{Math.min((page + 1) * pageSize, items.length)} of{' '}
        {items.length}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page === 0}
          onClick={() => setSelection({ page: page - 1, key: pageKey })}
        >
          Previous
        </Button>
        <span>
          Page {page + 1} of {pages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= pages - 1}
          onClick={() => setSelection({ page: page + 1, key: pageKey })}
        >
          Next
        </Button>
      </div>
    </nav>
  );
  return (
    <>
      {controls && wrap(controls)}
      {resultsHeading &&
        wrap(
          <div className="col-span-full mt-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">
              {resultsHeading}
            </h2>
            <span className="text-sm text-muted-foreground">
              {items.length} {active ? 'matching' : 'total'}
            </span>
          </div>,
        )}
      {removeControls && wrap(removeControls)}
      {items
        .slice(page * pageSize, (page + 1) * pageSize)
        .map((item, offset) => {
          if (
            !canRemove ||
            actions.individual === false ||
            layout === 'table' ||
            !ids.includes(
              String(asListRecord(data[indices[page * pageSize + offset]]).id),
            )
          )
            return item;
          const record = asListRecord(data[indices[page * pageSize + offset]]);
          const id = String(record.id);
          const recordLabel =
            [
              record.title,
              record.name,
              record.value,
              record.trigger,
              record.display_name,
              record.content,
            ].find((value) => typeof value === 'string' && value) || label;
          const button = (
            <div className="flex justify-end px-2 pb-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={actions.disabled || removing}
                aria-label={`Remove ${typeof recordLabel === 'string' ? recordLabel : label} from ${label.toLocaleLowerCase()}`}
                onClick={() => {
                  setRemoveError('');
                  setConfirm([id]);
                }}
              >
                Remove
              </Button>
            </div>
          );
          if (layout === 'list' && isValidElement(item))
            return cloneElement(
              item as ReactElement<{ children: ReactNode }>,
              {},
              <>
                {(item.props as { children: ReactNode }).children}
                {button}
              </>,
            );
          return (
            <div key={id} className="min-w-0">
              {item}
              {button}
            </div>
          );
        })}
      {!items.length &&
        !active &&
        wrap(
          <p className="col-span-full p-4 text-sm text-muted-foreground">
            No {label.toLocaleLowerCase()} to show.
          </p>,
        )}
      {!items.length &&
        active &&
        wrap(
          <p className="col-span-full p-4 text-sm text-muted-foreground">
            No matches. Change or clear your filters to see more.
          </p>,
        )}
      {navigation && wrap(navigation)}
      {actions && wrap(confirmation)}
    </>
  );
}
