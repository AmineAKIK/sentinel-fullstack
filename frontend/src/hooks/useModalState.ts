import { useReducer } from 'react';
import { WorkshopIncident } from '../types';

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
  reviewType: 'edit' | 'delete' | null;
  reviewError: string;
  reviewLoading: boolean;
  unfollowConfirmIncident: WorkshopIncident | null;
  deleteResponsibleCommentIncident: WorkshopIncident | null;
}

type ModalAction =
  | { type: 'OPEN'; modal: ActiveModal }
  | { type: 'CLOSE' }
  | { type: 'OPEN_REVIEW'; incident: WorkshopIncident; reviewType: 'edit' | 'delete' }
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
      return { ...state, activeModal: action.modal };
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
  openReview: (incident: WorkshopIncident, type: 'edit' | 'delete') => void;
  closeReview: () => void;
  setReviewError: (error: string) => void;
  setReviewLoading: (loading: boolean) => void;
  setUnfollowConfirm: (incident: WorkshopIncident | null) => void;
  setDeleteCommentConfirm: (incident: WorkshopIncident | null) => void;
}

export function useModalState(): ModalStateApi {
  const [state, dispatch] = useReducer(modalReducer, initialState);

  return {
    state,
    openModal: (modal) => dispatch({ type: 'OPEN', modal }),
    closeModal: () => dispatch({ type: 'CLOSE' }),
    openReview: (incident, type) => dispatch({ type: 'OPEN_REVIEW', incident, reviewType: type }),
    closeReview: () => dispatch({ type: 'CLOSE_REVIEW' }),
    setReviewError: (error) => dispatch({ type: 'SET_REVIEW_ERROR', error }),
    setReviewLoading: (loading) => dispatch({ type: 'SET_REVIEW_LOADING', loading }),
    setUnfollowConfirm: (incident) => dispatch({ type: 'SET_UNFOLLOW_CONFIRM', incident }),
    setDeleteCommentConfirm: (incident) => dispatch({ type: 'SET_DELETE_COMMENT_CONFIRM', incident }),
  };
}
