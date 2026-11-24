import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CommunityComment,
  CommunityReactionEmoji,
  CommunitySummary,
  CommunityTargetType,
} from '@/types';
import { isAuthError } from '@/lib/authSession';
import {
  CommunityApiError,
  deleteCommunityCommentApi,
  editCommunityCommentApi,
  fetchCommunitySummary,
  postCommunityComment,
  saveCommunityRating,
  toggleCommunityReactionApi,
} from '@/lib/communityApi';
import type { ToastType } from '@/hooks/useToast';

export interface UseCommunityReviewsOptions {
  targetType: CommunityTargetType;
  targetKey: string;
  lockedMessage?: string | null;
  currentChapterNumber?: number;
  onRatingUpdated?: (average: number | null, count: number) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function useCommunityReviews({
  targetType,
  targetKey,
  lockedMessage = null,
  currentChapterNumber,
  onRatingUpdated,
  onApiError,
  onNotify,
}: UseCommunityReviewsOptions) {
  const activeTargetRef = useRef(`${targetType}:${targetKey}`);
  activeTargetRef.current = `${targetType}:${targetKey}`;

  const [summary, setSummary] = useState<CommunitySummary | null>(null);
  const [loading, setLoading] = useState(!lockedMessage);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLockedByApi, setIsLockedByApi] = useState(false);

  const [savingRating, setSavingRating] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<CommunityComment | null>(null);
  const [tagChapter, setTagChapter] = useState<number | null>(() =>
    targetType === 'book' && currentChapterNumber ? currentChapterNumber : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingBusyId, setEditingBusyId] = useState<string | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);

  useEffect(() => {
    if (targetType === 'book') {
      setTagChapter(
        typeof currentChapterNumber === 'number' && currentChapterNumber > 0
          ? currentChapterNumber
          : null,
      );
    }
  }, [currentChapterNumber, targetType]);

  const loadSummary = useCallback(
    async (signal?: AbortSignal) => {
      if (lockedMessage) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      setIsLockedByApi(false);
      try {
        const data = await fetchCommunitySummary(targetType, targetKey, signal);
        if (signal?.aborted) return;
        setSummary(data);
      } catch (err) {
        if (signal?.aborted) return;
        if (isAuthError(err)) {
          onApiError?.(err, 'Phiên đăng nhập đã hết hạn.');
          return;
        }
        if (err instanceof CommunityApiError && err.status === 403) {
          setIsLockedByApi(true);
          setLoadError(err.message);
        } else {
          setLoadError(err instanceof Error ? err.message : 'Không thể tải đánh giá và bình luận.');
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [lockedMessage, onApiError, targetKey, targetType],
  );

  useEffect(() => {
    setSummary(null);
    setDraft('');
    setReplyTarget(null);
    setSubmitError(null);
    setConfirmDeleteId(null);
    setSavingRating(false);
    setSubmitting(false);
    setEditingBusyId(null);
    setReactingId(null);
    setDeletingId(null);
    const controller = new AbortController();
    void loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary]);

  const handleRate = async (star: number) => {
    if (savingRating) return;
    const reqKey = `${targetType}:${targetKey}`;
    const nextRating = summary?.myRating === star ? null : star;
    setSavingRating(true);
    try {
      const updated = await saveCommunityRating(targetType, targetKey, nextRating);
      if (activeTargetRef.current !== reqKey) return;
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              averageRating: updated.averageRating,
              ratingCount: updated.ratingCount,
              myRating: updated.myRating,
            }
          : { targetType, targetKey, ...updated, comments: [], totalComments: 0 },
      );
      onRatingUpdated?.(updated.averageRating, updated.ratingCount);
      onNotify?.(
        nextRating ? `Đã chấm ${nextRating}/5 sao.` : 'Đã gỡ điểm đánh giá của bạn.',
        'success',
      );
    } catch (err) {
      if (activeTargetRef.current !== reqKey) return;
      if (isAuthError(err)) {
        onApiError?.(err, 'Phiên đăng nhập đã hết hạn.');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Không thể lưu điểm đánh giá.';
      setSubmitError(msg);
      onNotify?.(msg, 'error');
    } finally {
      if (activeTargetRef.current === reqKey) setSavingRating(false);
    }
  };

  const handleSubmitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    const reqKey = `${targetType}:${targetKey}`;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await postCommunityComment(targetType, targetKey, trimmed, {
        parentId: replyTarget?.id ?? null,
        chapterNumber: targetType === 'book' ? tagChapter : null,
      });
      if (activeTargetRef.current !== reqKey) return;
      setDraft('');
      setReplyTarget(null);
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              comments: [created, ...prev.comments],
              totalComments: prev.totalComments + 1,
            }
          : {
              targetType,
              targetKey,
              averageRating: null,
              ratingCount: 0,
              myRating: null,
              comments: [created],
              totalComments: 1,
            },
      );
      onNotify?.(replyTarget ? 'Đã gửi phản hồi.' : 'Đã đăng bình luận của bạn.', 'success');
    } catch (err) {
      if (activeTargetRef.current !== reqKey) return;
      if (isAuthError(err)) {
        onApiError?.(err, 'Phiên đăng nhập đã hết hạn.');
        return;
      }
      setSubmitError(err instanceof Error ? err.message : 'Không thể gửi bình luận.');
    } finally {
      if (activeTargetRef.current === reqKey) setSubmitting(false);
    }
  };

  const handleEditComment = async (commentId: string, nextContent: string): Promise<boolean> => {
    if (editingBusyId) return false;
    const reqKey = `${targetType}:${targetKey}`;
    setEditingBusyId(commentId);
    try {
      const updated = await editCommunityCommentApi(commentId, nextContent);
      if (activeTargetRef.current !== reqKey) return false;
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.map((c) => (c.id === commentId ? updated : c)),
            }
          : prev,
      );
      onNotify?.('Đã cập nhật bình luận.', 'success');
      return true;
    } catch (err) {
      if (isAuthError(err)) onApiError?.(err, 'Phiên đăng nhập đã hết hạn.');
      else {
        const msg = err instanceof Error ? err.message : 'Không thể cập nhật bình luận.';
        setSubmitError(msg);
        onNotify?.(msg, 'error');
      }
      return false;
    } finally {
      if (activeTargetRef.current === reqKey) setEditingBusyId(null);
    }
  };

  const handleToggleReaction = async (commentId: string, emoji: CommunityReactionEmoji) => {
    if (reactingId) return;
    const reqKey = `${targetType}:${targetKey}`;
    setReactingId(commentId);
    try {
      const snap = await toggleCommunityReactionApi(commentId, emoji);
      if (activeTargetRef.current !== reqKey) return;
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.map((c) =>
                c.id === commentId
                  ? { ...c, reactions: snap.reactions, myReactions: snap.myReactions }
                  : c,
              ),
            }
          : prev,
      );
    } catch (err) {
      if (isAuthError(err)) onApiError?.(err, 'Phiên đăng nhập đã hết hạn.');
      else onNotify?.(err instanceof Error ? err.message : 'Không thể thả biểu cảm.', 'error');
    } finally {
      if (activeTargetRef.current === reqKey) setReactingId(null);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (deletingId) return;
    const reqKey = `${targetType}:${targetKey}`;
    setDeletingId(commentId);
    try {
      await deleteCommunityCommentApi(commentId);
      if (activeTargetRef.current !== reqKey) return;
      setConfirmDeleteId(null);
      if (replyTarget?.id === commentId) setReplyTarget(null);
      setSummary((prev) => {
        if (!prev) return prev;
        const remaining = prev.comments.filter((c) => c.id !== commentId && c.parentId !== commentId);
        const removedCount = Math.max(1, prev.comments.length - remaining.length);
        return {
          ...prev,
          comments: remaining,
          totalComments: Math.max(0, prev.totalComments - removedCount),
        };
      });
      onNotify?.('Đã xoá bình luận.', 'info');
    } catch (err) {
      if (activeTargetRef.current !== reqKey) return;
      if (isAuthError(err)) onApiError?.(err, 'Phiên đăng nhập đã hết hạn.');
      else {
        const msg = err instanceof Error ? err.message : 'Không thể xoá bình luận.';
        setSubmitError(msg);
        onNotify?.(msg, 'error');
      }
    } finally {
      if (activeTargetRef.current === reqKey) setDeletingId(null);
    }
  };

  const { roots, repliesMap } = useMemo(() => {
    const list = summary?.comments ?? [];
    const rootItems: CommunityComment[] = [];
    const byParent = new Map<string, CommunityComment[]>();
    const rootIds = new Set(list.filter((c) => !c.parentId).map((c) => c.id));
    for (const c of list) {
      if (c.parentId && rootIds.has(c.parentId)) {
        const arr = byParent.get(c.parentId) ?? [];
        arr.push(c);
        byParent.set(c.parentId, arr);
      } else {
        rootItems.push(c);
      }
    }
    for (const arr of byParent.values()) arr.sort((a, b) => a.createdAt - b.createdAt);
    return { roots: rootItems, repliesMap: byParent };
  }, [summary?.comments]);

  return {
    summary, loading, loadError, isLockedByApi, savingRating,
    draft, setDraft, replyTarget, setReplyTarget, tagChapter, setTagChapter,
    submitting, submitError, setSubmitError,
    confirmDeleteId, setConfirmDeleteId, deletingId, editingBusyId, reactingId,
    roots, repliesMap, loadSummary,
    handleRate, handleSubmitComment, handleEditComment, handleToggleReaction, handleDeleteComment,
  };
}
