'use client';

import Modal from '@/components/ui/Modal';
import RegisterUserForm from '@/components/users/RegisterUserForm';

/** Kept for compatibility; prefer /hr/users full page. */
export default function RegisterUserModal({ isOpen, onClose, onSuccess }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Register New User" size="lg">
      <RegisterUserForm
        mode="create"
        onCancel={onClose}
        onSuccess={() => {
          if (onSuccess) onSuccess();
          setTimeout(() => onClose(), 1200);
        }}
      />
    </Modal>
  );
}
