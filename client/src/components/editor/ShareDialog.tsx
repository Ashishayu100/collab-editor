import { Check, Copy, Link2, Loader2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { DocumentRole } from '../../api/documents';
import { Collaborator, ShareableRole } from '../../api/sharing';
import { useCollaborators } from '../../hooks/useCollaborators';
import { getErrorMessage } from '../../lib/utils';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  currentUserRole: DocumentRole;
  /** Called after the current user removes themselves from the document ("leave"). */
  onLeft: () => void;
}

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: ShareableRole;
  onChange: (role: ShareableRole) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ShareableRole)}
      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      <option value="EDITOR">Editor</option>
      <option value="VIEWER">Viewer</option>
    </select>
  );
}

function AvatarCircle({ name, color }: { name: string; color: string }) {
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function ShareDialog({ isOpen, onClose, documentId, documentTitle, currentUserRole, onLeft }: ShareDialogProps) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const addToast = useToastStore((state) => state.addToast);
  const isOwner = currentUserRole === 'OWNER';

  const {
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
  } = useCollaborators(documentId);

  const [email, setEmail] = useState('');
  const [addRole, setAddRole] = useState<ShareableRole>('EDITOR');
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const [linkRole, setLinkRole] = useState<ShareableRole>('VIEWER');
  const [isLinkBusy, setIsLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [pendingRemoval, setPendingRemoval] = useState<Collaborator | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void fetchAll();
      setEmail('');
      setAddError(null);
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, documentId]);

  useEffect(() => {
    if (shareLink.enabled && shareLink.role) setLinkRole(shareLink.role);
  }, [shareLink.enabled, shareLink.role]);

  if (!isOpen) return null;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await addCollaborator(trimmed, addRole);
      setEmail('');
      addToast(`Added ${trimmed}`, 'success');
    } catch (err) {
      setAddError(getErrorMessage(err));
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRoleChange(collaborator: Collaborator, role: ShareableRole) {
    setRowBusyId(collaborator.id);
    try {
      await updateCollaboratorRole(collaborator.id, role);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleConfirmRemoval() {
    if (!pendingRemoval) return;
    setIsRemoving(true);
    try {
      await removeCollaborator(pendingRemoval.id);
      const isSelf = pendingRemoval.userId === currentUserId;
      setPendingRemoval(null);
      if (isSelf) {
        addToast('You left the document', 'info');
        onLeft();
      }
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setIsRemoving(false);
    }
  }

  async function handleToggleLink() {
    setIsLinkBusy(true);
    try {
      if (shareLink.enabled) {
        await disableShareLink();
      } else {
        await generateShareLink(linkRole);
      }
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setIsLinkBusy(false);
    }
  }

  async function handleLinkRoleChange(role: ShareableRole) {
    setLinkRole(role);
    if (!shareLink.enabled) return;
    setIsLinkBusy(true);
    try {
      await generateShareLink(role);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setIsLinkBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!shareLink.url) return;
    await navigator.clipboard.writeText(shareLink.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="truncate text-base font-semibold text-gray-900">Share &quot;{documentTitle}&quot;</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close share dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isOwner && (
            <div className="mb-5">
              <h3 className="mb-2 text-sm font-medium text-gray-700">Add people</h3>
              <form onSubmit={(e) => void handleAdd(e)} className="flex items-start gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <RoleSelect value={addRole} onChange={setAddRole} />
                <button
                  type="submit"
                  disabled={isAdding || !email.trim()}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAdding ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
                </button>
              </form>
              {addError && <p className="mt-1.5 text-xs text-red-600">{addError}</p>}
            </div>
          )}

          <div className="mb-5">
            <h3 className="mb-2 text-sm font-medium text-gray-700">People with access</h3>
            {isLoading && collaborators.length === 0 && (
              <div className="flex items-center justify-center py-6 text-sm text-gray-400">
                <Loader2 size={16} className="mr-2 animate-spin" /> Loading…
              </div>
            )}
            {error && <p className="py-2 text-sm text-red-600">{error}</p>}
            <div className="space-y-1">
              {collaborators.map((c) => {
                const isSelf = c.userId === currentUserId;
                return (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <AvatarCircle name={c.name} color={c.avatarColor} />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-900">
                          {isSelf ? 'You' : c.name}
                          {c.isOwner && <span className="text-gray-400"> (owner)</span>}
                        </p>
                        <p className="truncate text-xs text-gray-400">{c.email}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {c.isOwner ? (
                        <span className="px-2 py-1 text-xs font-medium text-gray-500">Owner</span>
                      ) : isOwner ? (
                        <>
                          <RoleSelect
                            value={c.role as ShareableRole}
                            disabled={rowBusyId === c.id}
                            onChange={(role) => void handleRoleChange(c, role)}
                          />
                          <button
                            type="button"
                            onClick={() => setPendingRemoval(c)}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remove ${c.name}`}
                          >
                            <X size={15} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="px-2 py-1 text-xs font-medium text-gray-500">
                            {c.role === 'EDITOR' ? 'Editor' : 'Viewer'}
                          </span>
                          {isSelf && (
                            <button
                              type="button"
                              onClick={() => setPendingRemoval(c)}
                              className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                            >
                              Leave
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {isOwner && (
            <>
              <hr className="my-4 border-gray-200" />
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-700">Share via link</h3>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Link2 size={15} className="text-gray-400" />
                      {shareLink.enabled ? 'Anyone with the link' : 'Link sharing is off'}
                    </div>
                    <div className="flex items-center gap-2">
                      {shareLink.enabled && (
                        <RoleSelect value={linkRole} disabled={isLinkBusy} onChange={(r) => void handleLinkRoleChange(r)} />
                      )}
                      <button
                        type="button"
                        onClick={() => void handleToggleLink()}
                        disabled={isLinkBusy}
                        role="switch"
                        aria-checked={shareLink.enabled}
                        aria-label="Toggle link sharing"
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-60 ${
                          shareLink.enabled ? 'bg-primary' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${
                            shareLink.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {shareLink.enabled && shareLink.url && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        readOnly
                        value={shareLink.url}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCopyLink()}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                      >
                        {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                        {copied ? 'Copied!' : 'Copy link'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Done
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={pendingRemoval !== null}
        title={
          pendingRemoval?.userId === currentUserId
            ? 'Leave this document?'
            : `Remove ${pendingRemoval?.name ?? 'this person'}?`
        }
        description={
          pendingRemoval?.userId === currentUserId
            ? "You'll lose access to this document unless someone shares it with you again."
            : 'They will immediately lose access to this document.'
        }
        confirmLabel={pendingRemoval?.userId === currentUserId ? 'Leave' : 'Remove'}
        variant="danger"
        isConfirming={isRemoving}
        onConfirm={() => void handleConfirmRemoval()}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
