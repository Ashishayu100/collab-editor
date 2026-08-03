import { useCallback, useState } from 'react';
import { Collaborator, ShareableRole, ShareLinkStatus, sharingApi } from '../api/sharing';
import { getErrorMessage } from '../lib/utils';

export function useCollaborators(documentId: string) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [shareLink, setShareLink] = useState<ShareLinkStatus>({ enabled: false });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [collabRes, linkRes] = await Promise.all([
        sharingApi.listCollaborators(documentId),
        sharingApi.getShareLink(documentId).catch(() => ({ data: { enabled: false } as ShareLinkStatus })),
      ]);
      setCollaborators(collabRes.data.collaborators);
      setShareLink(linkRes.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  const addCollaborator = useCallback(
    async (email: string, role: ShareableRole) => {
      const { data } = await sharingApi.addCollaborator(documentId, email, role);
      setCollaborators((prev) => [...prev, data.collaborator]);
      return data.collaborator;
    },
    [documentId]
  );

  const updateCollaboratorRole = useCallback(
    async (collaboratorId: string, role: ShareableRole) => {
      const { data } = await sharingApi.updateCollaboratorRole(documentId, collaboratorId, role);
      setCollaborators((prev) => prev.map((c) => (c.id === collaboratorId ? data.collaborator : c)));
      return data.collaborator;
    },
    [documentId]
  );

  const removeCollaborator = useCallback(
    async (collaboratorId: string) => {
      await sharingApi.removeCollaborator(documentId, collaboratorId);
      setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorId));
    },
    [documentId]
  );

  const generateShareLink = useCallback(
    async (role: ShareableRole) => {
      const { data } = await sharingApi.generateShareLink(documentId, role);
      setShareLink(data);
      return data;
    },
    [documentId]
  );

  const disableShareLink = useCallback(async () => {
    await sharingApi.disableShareLink(documentId);
    setShareLink({ enabled: false });
  }, [documentId]);

  return {
    collaborators,
    shareLink,
    isLoading,
    error,
    fetchAll,
    addCollaborator,
    updateCollaboratorRole,
    removeCollaborator,
    generateShareLink,
    disableShareLink,
  };
}
