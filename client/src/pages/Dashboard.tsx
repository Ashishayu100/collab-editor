import { FileText, Plus, Search, Star, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { documentApi, DocumentSearchResult } from '../api/documents';
import { DocumentCard } from '../components/DocumentCard';
import { DashboardView, Sidebar } from '../components/dashboard/Sidebar';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/Button';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getErrorMessage } from '../lib/utils';
import { useDocumentStore } from '../stores/documentStore';

const VIEW_TITLES: Record<DashboardView['type'], string> = {
  all: 'All Documents',
  starred: 'Starred',
  shared: 'Shared with Me',
  recent: 'Recent',
  folder: '',
};

function DocumentCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-6 h-24 animate-pulse rounded-lg bg-gray-100" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
      <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-gray-100" />
      <div className="mt-4 h-7 w-7 animate-pulse rounded-full bg-gray-100" />
    </div>
  );
}

function SearchResultRow({ result, onOpen }: { result: DocumentSearchResult; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-shadow duration-150 hover:shadow-md"
    >
      <FileText className="shrink-0 text-gray-300" size={20} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{result.title}</p>
        <p className="text-xs text-gray-500">Updated {new Date(result.updatedAt).toLocaleDateString()}</p>
      </div>
      {result.starred && <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" />}
      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-gray-600">
        {result.role.toLowerCase()}
      </span>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { documents, isLoading, fetchDocuments, createDocument, updateTitle, deleteDocument, leaveDocument, toggleStar } =
    useDocumentStore();

  const [view, setView] = useState<DashboardView>({ type: 'all' });
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [searchResults, setSearchResults] = useState<DocumentSearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const isSearching = debouncedSearch.trim().length > 0;

  useEffect(() => {
    if (!isSearching) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    documentApi
      .search(debouncedSearch.trim())
      .then(({ data }) => setSearchResults(data.documents))
      .catch((err) => setSearchError(getErrorMessage(err)))
      .finally(() => setSearchLoading(false));
  }, [debouncedSearch, isSearching]);

  function refetchCurrentView() {
    if (view.type === 'all') void fetchDocuments({ folder: 'root' });
    else if (view.type === 'starred') void fetchDocuments({ starred: true });
    else if (view.type === 'shared') void fetchDocuments({ filter: 'shared' });
    else if (view.type === 'recent') void fetchDocuments({ sort: 'updatedAt', order: 'desc', limit: 10 });
    else void fetchDocuments({ folder: view.folderId });
  }

  useEffect(() => {
    if (isSearching) return;
    refetchCurrentView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isSearching, fetchDocuments]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function handleCreate() {
    setIsCreating(true);
    try {
      const document = await createDocument();
      navigate(`/document/${document.id}`);
    } finally {
      setIsCreating(false);
    }
  }

  const pageTitle = view.type === 'folder' ? view.folderName : VIEW_TITLES[view.type];
  const showEmptyState = !isSearching && !isLoading && documents.length === 0;

  return (
    <Layout>
      <div className="flex gap-6">
        <Sidebar view={view} onSelectView={setView} />

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-semibold text-gray-900">{pageTitle}</h1>
            <Button onClick={handleCreate} isLoading={isCreating} className="gap-1.5">
              <Plus size={16} /> New Document
            </Button>
          </div>

          <div className="relative mb-6 max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents... (Ctrl+K)"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-9 text-sm shadow-sm transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {isSearching ? (
            <div className="space-y-2">
              {searchLoading && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <DocumentCardSkeleton key={i} />
                  ))}
                </div>
              )}
              {searchError && <p className="text-sm text-red-600">{searchError}</p>}
              {!searchLoading && !searchError && searchResults?.length === 0 && (
                <p className="text-sm text-gray-500">No documents match &quot;{debouncedSearch}&quot;.</p>
              )}
              {!searchLoading &&
                searchResults?.map((result) => (
                  <SearchResultRow key={result.id} result={result} onOpen={() => navigate(`/document/${result.id}`)} />
                ))}
            </div>
          ) : (
            <>
              {isLoading && documents.length === 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <DocumentCardSkeleton key={i} />
                  ))}
                </div>
              )}

              {showEmptyState && (
                <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white py-20 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                    <FileText className="text-primary" size={28} />
                  </div>
                  {view.type === 'starred' ? (
                    <p className="text-sm text-gray-500">No starred documents yet.</p>
                  ) : view.type === 'shared' ? (
                    <p className="text-sm text-gray-500">No documents have been shared with you yet.</p>
                  ) : view.type === 'folder' ? (
                    <p className="text-sm text-gray-500">This folder is empty.</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500">No documents yet. Create your first document!</p>
                      <Button onClick={handleCreate} isLoading={isCreating} className="gap-1.5">
                        <Plus size={16} /> Create your first document
                      </Button>
                    </>
                  )}
                </div>
              )}

              {!showEmptyState && documents.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {documents.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      onRename={updateTitle}
                      onDelete={deleteDocument}
                      onLeave={leaveDocument}
                      onToggleStar={toggleStar}
                      onMoved={refetchCurrentView}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
