import { useCallback, useState } from 'react';
import { VersionDetail, VersionSummary, versionApi } from '../api/versions';
import { getErrorMessage } from '../lib/utils';
import { downloadVersionAsHtml } from '../lib/versionExport';

export function useVersions(documentId: string) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await versionApi.list(documentId);
      setVersions(data.versions);
      setNextCursor(data.nextCursor);
      setTotal(data.total);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await versionApi.list(documentId, { cursor: nextCursor });
      setVersions((prev) => [...prev, ...data.versions]);
      setNextCursor(data.nextCursor);
      setTotal(data.total);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [documentId, nextCursor, isLoading]);

  const createVersion = useCallback(
    async (label?: string): Promise<VersionSummary> => {
      const { data } = await versionApi.create(documentId, label);
      setVersions((prev) => [data.version, ...prev]);
      setTotal((prev) => prev + 1);
      return data.version;
    },
    [documentId]
  );

  const restoreVersion = useCallback(
    async (versionId: string): Promise<VersionSummary> => {
      const { data } = await versionApi.restore(documentId, versionId);
      // A restore actually creates two new versions server-side (the pre-restore auto-save and
      // the "Restored from version N" entry) — refetch rather than guess at both.
      await fetchVersions();
      return data.version;
    },
    [documentId, fetchVersions]
  );

  const getVersionContent = useCallback(
    async (versionId: string): Promise<VersionDetail> => {
      const { data } = await versionApi.get(documentId, versionId);
      return data.version;
    },
    [documentId]
  );

  const exportVersionAsHtml = useCallback(
    async (version: VersionSummary, documentTitle: string): Promise<void> => {
      const detail = await getVersionContent(version.id);
      downloadVersionAsHtml({
        content: detail.content,
        documentTitle,
        versionNum: version.versionNum,
        label: version.label,
      });
    },
    [getVersionContent]
  );

  return {
    versions,
    total,
    isLoading,
    error,
    hasMore: nextCursor !== null,
    fetchVersions,
    loadMore,
    createVersion,
    restoreVersion,
    getVersionContent,
    exportVersionAsHtml,
  };
}
