import { FileText, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentCard } from '../components/DocumentCard';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/Button';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useDocumentStore } from '../stores/documentStore';

type DocumentFilter = 'all' | 'owned' | 'shared';

const FILTER_TABS: { value: DocumentFilter; label: string }[] = [
  { value: 'all', label: 'All Documents' },
  { value: 'owned', label: 'My Documents' },
  { value: 'shared', label: 'Shared with Me' },
];

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

export default function Dashboard() {
  const navigate = useNavigate();
  const { documents, isLoading, fetchDocuments, createDocument, updateTitle, deleteDocument, leaveDocument } =
    useDocumentStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DocumentFilter>('all');
  const [isCreating, setIsCreating] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    void fetchDocuments(debouncedSearch || undefined, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filter]);

  async function handleCreate() {
    setIsCreating(true);
    try {
      const document = await createDocument();
      navigate(`/document/${document.id}`);
    } finally {
      setIsCreating(false);
    }
  }

  const showEmptyState = !isLoading && documents.length === 0;

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Your Documents</h1>
        <Button onClick={handleCreate} isLoading={isCreating} className="gap-1.5">
          <Plus size={16} /> New Document
        </Button>
      </div>

      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 ${
              filter === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative mb-6 max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents..."
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
          {search ? (
            <p className="text-sm text-gray-500">No documents match &quot;{search}&quot;.</p>
          ) : filter === 'shared' ? (
            <p className="text-sm text-gray-500">No documents have been shared with you yet.</p>
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
            <DocumentCard key={doc.id} doc={doc} onRename={updateTitle} onDelete={deleteDocument} onLeave={leaveDocument} />
          ))}
        </div>
      )}
    </Layout>
  );
}
