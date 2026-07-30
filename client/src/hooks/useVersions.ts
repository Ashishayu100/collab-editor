import { useCallback, useState } from 'react';
import { VersionDetail, VersionSummary, versionApi } from '../api/versions';
import { getErrorMessage } from '../lib/utils';

export function useVersions(documentId: string) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
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
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [documentId, nextCursor, isLoading]);

  const createVersion = useCallback(async (): Promise<VersionSummary> => {
    const { data } = await versionApi.create(documentId);
    setVersions((prev) => [data.version, ...prev]);
    return data.version;
  }, [documentId]);

  const restoreVersion = useCallback(
    async (versionId: string): Promise<VersionSummary> => {
      const { data } = await versionApi.restore(documentId, versionId);
      setVersions((prev) => [data.version, ...prev]);
      return data.version;
    },
    [documentId]
  );

  const getVersionContent = useCallback(
    async (versionId: string): Promise<VersionDetail> => {
      const { data } = await versionApi.get(documentId, versionId);
      return data.version;
    },
    [documentId]
  );

  return {
    versions,
    isLoading,
    error,
    hasMore: nextCursor !== null,
    fetchVersions,
    loadMore,
    createVersion,
    restoreVersion,
    getVersionContent,
  };
}
