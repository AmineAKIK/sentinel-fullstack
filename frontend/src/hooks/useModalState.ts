import { useCallback, useMemo, useReducer } from 'react';
import { WorkshopIncident } from '../types';

export type ReviewType = 'edit' | 'delete';

export type ActiveModal =
  | 'create'
  | 'edit'
  | 'deleteRequest'
  | 'takeCharge'
  | 'pending'
  | 'resume'
  | 'close'
  | 'invalidate'
  | 'maintenanceDirect'
  | 'maintenanceApprove'
  | 'filters'
  | null;

interface ModalState {
  activeModal: ActiveModal;
  reviewIncident: WorkshopIncident | null;
  reviewType: ReviewType | null;
  reviewError: string;
  reviewLoading: boolean;
  unfollowConfirmIncident: WorkshopIncident | null;
  deleteResponsibleCommentIncident: WorkshopIncident | null;
}

type ModalAction =
  | { type: 'OPEN'; modal: ActiveModal }
  | { type: 'CLOSE' }
  | { type: 'OPEN_REVIEW'; incident: WorkshopIncident; reviewType: ReviewType }
  | { type: 'CLOSE_REVIEW' }
  | { type: 'SET_REVIEW_ERROR'; error: string }
  | { type: 'SET_REVIEW_LOADING'; loading: boolean }
  | { type: 'SET_UNFOLLOW_CONFIRM'; incident: WorkshopIncident | null }
  | { type: 'SET_DELETE_COMMENT_CONFIRM'; incident: WorkshopIncident | null };

const initialState: ModalState = {
  activeModal: null,
  reviewIncident: null,
  reviewType: null,
  reviewError: '',
  reviewLoading: false,
  unfollowConfirmIncident: null,
  deleteResponsibleCommentIncident: null,
};

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'OPEN':
      return { ...state, activeModal: action.modal, reviewError: '', reviewLoading: false };
    case 'CLOSE':
      return { ...state, activeModal: null };
    case 'OPEN_REVIEW':
      return {
        ...state,
        reviewIncident: action.incident,
        reviewType: action.reviewType,
        reviewError: '',
        reviewLoading: false,
      };
    case 'CLOSE_REVIEW':
      return {
        ...state,
        reviewIncident: null,
        reviewType: null,
        reviewError: '',
        reviewLoading: false,
        activeModal: null,
      };
    case 'SET_REVIEW_ERROR':
      return { ...state, reviewError: action.error };
    case 'SET_REVIEW_LOADING':
      return { ...state, reviewLoading: action.loading };
    case 'SET_UNFOLLOW_CONFIRM':
      return { ...state, unfollowConfirmIncident: action.incident };
    case 'SET_DELETE_COMMENT_CONFIRM':
      return { ...state, deleteResponsibleCommentIncident: action.incident };
  }
}

export interface ModalStateApi {
  state: ModalState;
  openModal: (modal: ActiveModal) => void;
  closeModal: () => void;
  openReview: (incident: WorkshopIncident, type: ReviewType) => void;
  closeReview: () => void;
  setReviewError: (error: string) => void;
  setReviewLoading: (loading: boolean) => void;
  setUnfollowConfirm: (incident: WorkshopIncident | null) => void;
  setDeleteCommentConfirm: (incident: WorkshopIncident | null) => void;
}

export function useModalState(): ModalStateApi {
  const [state, dispatch] = useReducer(modalReducer, initialState);

  const openModal = useCallback((modal: ActiveModal) => dispatch({ type: 'OPEN', modal }), []);
  const closeModal = useCallback(() => dispatch({ type: 'CLOSE' }), []);
  const openReview = useCallback(
    (incident: WorkshopIncident, reviewType: ReviewType) =>
      dispatch({ type: 'OPEN_REVIEW', incident, reviewType }),
    []
  );
  const closeReview = useCallback(() => dispatch({ type: 'CLOSE_REVIEW' }), []);
  const setReviewError = useCallback(
    (error: string) => dispatch({ type: 'SET_REVIEW_ERROR', error }),
    []
  );
  const setReviewLoading = useCallback(
    (loading: boolean) => dispatch({ type: 'SET_REVIEW_LOADING', loading }),
    []
  );
  const setUnfollowConfirm = useCallback(
    (incident: WorkshopIncident | null) => dispatch({ type: 'SET_UNFOLLOW_CONFIRM', incident }),
    []
  );
  const setDeleteCommentConfirm = useCallback(
    (incident: WorkshopIncident | null) =>
      dispatch({ type: 'SET_DELETE_COMMENT_CONFIRM', incident }),
    []
  );

  return useMemo(
    () => ({
      state,
      openModal,
      closeModal,
      openReview,
      closeReview,
      setReviewError,
      setReviewLoading,
      setUnfollowConfirm,
      setDeleteCommentConfirm,
    }),
    [
      state,
      openModal,
      closeModal,
      openReview,
      closeReview,
      setReviewError,
      setReviewLoading,
      setUnfollowConfirm,
      setDeleteCommentConfirm,
    ]
  );
}
