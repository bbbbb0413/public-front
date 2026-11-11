import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserManagement } from './UserManagement';
import * as adminApi from '../../api/admin';

vi.mock('../../api/admin', () => ({
  getUsers: vi.fn(),
  getUserById: vi.fn(),
  activateUser: vi.fn(),
  updateUserRole: vi.fn(),
  changePassword: vi.fn(),
  deleteUser: vi.fn(),
}));

const mockUsers: adminApi.AdminUser[] = [
  {
    id: 1,
    name: '관리자',
    email: 'admin@test.com',
    role: 'admin',
    activatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: '일반유저',
    email: 'user@test.com',
    role: 'user',
    activatedAt: null,
  },
];

const mockMeta: adminApi.PageMeta = {
  page: 1,
  take: 10,
  itemCount: 2,
  pageCount: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

describe('UserManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getUsers).mockResolvedValue({
      data: mockUsers,
      meta: mockMeta,
    });
  });

  it('초기 렌더링 시 유저 목록을 불러와 표시한다', async () => {
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      expect(screen.getByText('user@test.com')).toBeInTheDocument();
    });
  });

  describe('비밀번호 변경', () => {
    it('새 비밀번호를 입력하고 변경 성공 시 모달이 닫힌다', async () => {
      vi.mocked(adminApi.changePassword).mockResolvedValueOnce();

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const changePwButtons = screen.getAllByRole('button', { name: '비번변경' });
      fireEvent.click(changePwButtons[0]);

      expect(screen.getByRole('heading', { name: '비밀번호 변경' })).toBeInTheDocument();
      expect(screen.getAllByText('admin@test.com').length).toBeGreaterThanOrEqual(2);

      const input = screen.getByPlaceholderText('새 비밀번호');
      fireEvent.change(input, { target: { value: 'ValidPass123!@' } });

      const submitButton = screen.getByRole('button', { name: '변경' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(adminApi.changePassword).toHaveBeenCalledWith('admin@test.com', 'ValidPass123!@');
        expect(screen.queryByRole('heading', { name: '비밀번호 변경' })).not.toBeInTheDocument();
      });
    });

    it('비밀번호 입력 필드가 빈 값일 경우 변경 버튼을 클릭해도 API를 호출하지 않는다', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const changePwButtons = screen.getAllByRole('button', { name: '비번변경' });
      fireEvent.click(changePwButtons[0]);

      const submitButton = screen.getByRole('button', { name: '변경' });
      fireEvent.click(submitButton);

      expect(adminApi.changePassword).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: '비밀번호 변경' })).toBeInTheDocument();
    });

    it('비밀번호 입력 필드가 공백 문자열인 경우에도 변경 버튼을 클릭해도 API를 호출하지 않는다', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const changePwButtons = screen.getAllByRole('button', { name: '비번변경' });
      fireEvent.click(changePwButtons[0]);

      const input = screen.getByPlaceholderText('새 비밀번호');
      fireEvent.change(input, { target: { value: '   ' } });

      const submitButton = screen.getByRole('button', { name: '변경' });
      fireEvent.click(submitButton);

      expect(adminApi.changePassword).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: '비밀번호 변경' })).toBeInTheDocument();
    });

    it('비밀번호 변경 모달에서 취소 버튼 클릭 시 모달이 닫힌다', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const changePwButtons = screen.getAllByRole('button', { name: '비번변경' });
      fireEvent.click(changePwButtons[0]);

      expect(screen.getByRole('heading', { name: '비밀번호 변경' })).toBeInTheDocument();

      const cancelButton = screen.getByRole('button', { name: '취소' });
      fireEvent.click(cancelButton);

      expect(screen.queryByRole('heading', { name: '비밀번호 변경' })).not.toBeInTheDocument();
    });

    it('비밀번호 변경 요청 중에는 변경 버튼이 변경 중... 상태로 표시되고 비활성화된다', async () => {
      let resolveChangePassword: () => void;
      const changePasswordPromise = new Promise<void>((resolve) => {
        resolveChangePassword = resolve;
      });
      vi.mocked(adminApi.changePassword).mockReturnValueOnce(changePasswordPromise);

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const changePwButtons = screen.getAllByRole('button', { name: '비번변경' });
      fireEvent.click(changePwButtons[0]);

      const input = screen.getByPlaceholderText('새 비밀번호');
      fireEvent.change(input, { target: { value: 'ValidPass123!@' } });

      const submitButton = screen.getByRole('button', { name: '변경' });
      fireEvent.click(submitButton);

      expect(screen.getByRole('button', { name: '변경 중...' })).toBeDisabled();

      resolveChangePassword!();

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: '비밀번호 변경' })).not.toBeInTheDocument();
      });
    });

    it('비밀번호 변경 실패 시 백엔드 응답의 상세 에러 메시지를 pwError에 표시한다', async () => {
      const detailedMessage = '비밀번호는 10~30자이며 소문자/대문자/숫자/특수문자 중 4가지를 포함해야 합니다.';
      vi.mocked(adminApi.changePassword).mockRejectedValueOnce({
        response: {
          data: {
            message: detailedMessage,
          },
        },
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const changePwButtons = screen.getAllByRole('button', { name: '비번변경' });
      fireEvent.click(changePwButtons[0]);

      const input = screen.getByPlaceholderText('새 비밀번호');
      fireEvent.change(input, { target: { value: 'short' } });

      const submitButton = screen.getByRole('button', { name: '변경' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(detailedMessage)).toBeInTheDocument();
      });
    });

    it('비밀번호 변경 실패 시 백엔드 응답의 상세 에러 메시지가 배열이면 결합하여 pwError에 표시한다', async () => {
      vi.mocked(adminApi.changePassword).mockRejectedValueOnce({
        response: {
          data: {
            message: ['비밀번호는 최소 10자여야 합니다.', '특수문자가 필요합니다.'],
          },
        },
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const changePwButtons = screen.getAllByRole('button', { name: '비번변경' });
      fireEvent.click(changePwButtons[0]);

      const input = screen.getByPlaceholderText('새 비밀번호');
      fireEvent.change(input, { target: { value: 'short' } });

      const submitButton = screen.getByRole('button', { name: '변경' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('비밀번호는 최소 10자여야 합니다., 특수문자가 필요합니다.')).toBeInTheDocument();
      });
    });

    it('비밀번호 변경 실패 시 응답에 메시지가 없으면 기본 에러 문구를 표시한다', async () => {
      vi.mocked(adminApi.changePassword).mockRejectedValueOnce(new Error('Network error'));

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const changePwButtons = screen.getAllByRole('button', { name: '비번변경' });
      fireEvent.click(changePwButtons[0]);

      const input = screen.getByPlaceholderText('새 비밀번호');
      fireEvent.change(input, { target: { value: 'SomePass123!' } });

      const submitButton = screen.getByRole('button', { name: '변경' });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('비밀번호 변경에 실패했습니다.')).toBeInTheDocument();
      });
    });
  });

  describe('권한 변경', () => {
    it('권한 변경 성공 시 해당 유저의 권한이 갱신된다', async () => {
      vi.mocked(adminApi.updateUserRole).mockResolvedValueOnce({
        ...mockUsers[0],
        role: 'moderator',
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const roleSelects = screen.getAllByRole('combobox');
      fireEvent.change(roleSelects[0], { target: { value: 'moderator' } });

      await waitFor(() => {
        expect(adminApi.updateUserRole).toHaveBeenCalledWith(1, 'moderator');
        expect(roleSelects[0]).toHaveValue('moderator');
      });
    });

    it('권한 변경 실패 시 백엔드 응답의 상세 안내 메시지를 상단 에러 배너에 표시한다', async () => {
      const roleErrorMessage = '현재 사용자 권한 변경 기능은 지원되지 않습니다.';
      vi.mocked(adminApi.updateUserRole).mockRejectedValueOnce({
        response: {
          data: {
            message: roleErrorMessage,
          },
        },
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const roleSelects = screen.getAllByRole('combobox');
      fireEvent.change(roleSelects[0], { target: { value: 'moderator' } });

      await waitFor(() => {
        expect(adminApi.updateUserRole).toHaveBeenCalledWith(1, 'moderator');
        expect(screen.getByText(roleErrorMessage)).toBeInTheDocument();
      });
    });

    it('권한 변경 실패 시 백엔드 응답 메시지가 배열이면 결합하여 상단 에러 배너에 표시한다', async () => {
      vi.mocked(adminApi.updateUserRole).mockRejectedValueOnce({
        response: {
          data: {
            message: ['권한이 올바르지 않습니다.', '지원되지 않는 권한입니다.'],
          },
        },
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const roleSelects = screen.getAllByRole('combobox');
      fireEvent.change(roleSelects[0], { target: { value: 'moderator' } });

      await waitFor(() => {
        expect(adminApi.updateUserRole).toHaveBeenCalledWith(1, 'moderator');
        expect(screen.getByText('권한이 올바르지 않습니다., 지원되지 않는 권한입니다.')).toBeInTheDocument();
      });
    });

    it('권한 변경 실패 시 백엔드 응답 메시지가 없으면 기본 문구를 상단 에러 배너에 표시한다', async () => {
      vi.mocked(adminApi.updateUserRole).mockRejectedValueOnce(new Error('Server error'));

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const roleSelects = screen.getAllByRole('combobox');
      fireEvent.change(roleSelects[0], { target: { value: 'moderator' } });

      await waitFor(() => {
        expect(adminApi.updateUserRole).toHaveBeenCalledWith(1, 'moderator');
        expect(screen.getByText('권한 변경에 실패했습니다.')).toBeInTheDocument();
      });
    });
  });

  describe('활성화 및 유저 상세 조회 기능 유지', () => {
    it('활성화 토글 버튼 클릭 시 activateUser가 정상 호출된다', async () => {
      vi.mocked(adminApi.activateUser).mockResolvedValueOnce({
        ...mockUsers[0],
        activatedAt: null,
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const activateBtn = screen.getByRole('button', { name: '활성' });
      fireEvent.click(activateBtn);

      await waitFor(() => {
        expect(adminApi.activateUser).toHaveBeenCalledWith(1, false);
      });
    });

    it('상세 버튼 클릭 시 getUserById를 호출하여 모달에 유저 정보를 노출한다', async () => {
      vi.mocked(adminApi.getUserById).mockResolvedValueOnce({
        id: 1,
        name: '관리자',
        email: 'admin@test.com',
        role: 'admin',
        activatedAt: '2026-01-01T00:00:00.000Z',
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const detailButtons = screen.getAllByRole('button', { name: '상세' });
      fireEvent.click(detailButtons[0]);

      await waitFor(() => {
        expect(adminApi.getUserById).toHaveBeenCalledWith(1);
        expect(screen.getByRole('heading', { name: '유저 상세' })).toBeInTheDocument();
      });
    });

    it('새로고침 버튼 클릭 시 현재 페이지의 유저 목록을 다시 불러온다', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      expect(adminApi.getUsers).toHaveBeenCalledTimes(1);

      const refreshButton = screen.getByRole('button', { name: '새로고침' });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(adminApi.getUsers).toHaveBeenCalledTimes(2);
      });
    });

    it('다음 및 이전 페이지 버튼 클릭 시 해당 페이지의 유저 목록을 조회한다', async () => {
      vi.mocked(adminApi.getUsers).mockResolvedValueOnce({
        data: mockUsers,
        meta: {
          page: 1,
          take: 10,
          itemCount: 20,
          pageCount: 2,
          hasPreviousPage: false,
          hasNextPage: true,
        },
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      });

      const nextButton = screen.getByRole('button', { name: '다음' });
      expect(nextButton).toBeEnabled();

      vi.mocked(adminApi.getUsers).mockResolvedValueOnce({
        data: [
          {
            id: 11,
            name: '2페이지유저',
            email: 'page2@test.com',
            role: 'user',
            activatedAt: null,
          },
        ],
        meta: {
          page: 2,
          take: 10,
          itemCount: 20,
          pageCount: 2,
          hasPreviousPage: true,
          hasNextPage: false,
        },
      });

      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(adminApi.getUsers).toHaveBeenCalledWith(2, 10);
        expect(screen.getByText('page2@test.com')).toBeInTheDocument();
      });
    });
  });
});
