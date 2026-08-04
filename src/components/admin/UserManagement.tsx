import React, { useState, useEffect, useCallback } from 'react';
import {
  getUsers,
  getUserById,
  activateUser,
  updateUserRole,
  changePassword,
  deleteUser,
  AdminUser,
  PageMeta,
} from '../../api/admin';

const ROLES = ['admin', 'user', 'moderator'];

const cellStyle: React.CSSProperties = { padding: '10px 12px', color: '#cbd5e1', fontSize: 13, borderBottom: '1px solid #1e293b' };
const headStyle: React.CSSProperties = { padding: '10px 12px', color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #1e293b', textAlign: 'left' };

export const UserManagement = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [pwModal, setPwModal] = useState<{ email: string } | null>(null);
  const [newPw, setNewPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  const fetchUsers = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const result = await getUsers(p, 10);
      setUsers(result.data);
      setMeta(result.meta);
    } catch {
      setError('유저 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(page); }, [fetchUsers, page]);

  const handleToggleActivate = async (user: AdminUser) => {
    try {
      const updated = await activateUser(user.id, !user.activatedAt);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    } catch {
      setError('상태 변경에 실패했습니다.');
    }
  };

  const handleRoleChange = async (user: AdminUser, role: string) => {
    try {
      const updated = await updateUserRole(user.id, role);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    } catch {
      setError('권한 변경에 실패했습니다.');
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!window.confirm(`${user.email} 유저를 삭제하시겠습니까?`)) return;
    try {
      await deleteUser(user.id);
      fetchUsers(page);
    } catch {
      setError('삭제에 실패했습니다.');
    }
  };

  const handleShowDetail = async (user: AdminUser) => {
    setDetailLoading(true);
    setDetailUser(null);
    try {
      const detail = await getUserById(user.id);
      setDetailUser(detail);
    } catch {
      setError('유저 상세 조회에 실패했습니다.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwModal || !newPw.trim()) return;
    setPwLoading(true);
    setPwError('');
    try {
      await changePassword(pwModal.email, newPw);
      setPwModal(null);
      setNewPw('');
    } catch {
      setPwError('비밀번호 변경에 실패했습니다.');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>유저 관리</h3>
        <button
          onClick={() => fetchUsers(page)}
          style={{ padding: '6px 14px', background: '#334155', border: 'none', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
        >
          새로고침
        </button>
      </div>

      {error && (
        <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 6, padding: '10px 12px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>불러오는 중...</div>
      ) : (
        <div style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headStyle}>ID</th>
                <th style={headStyle}>이메일</th>
                <th style={headStyle}>이름</th>
                <th style={headStyle}>권한</th>
                <th style={headStyle}>활성화</th>
                <th style={headStyle}>액션</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td style={cellStyle}>{user.id}</td>
                  <td style={cellStyle}>{user.email}</td>
                  <td style={cellStyle}>{user.name || '-'}</td>
                  <td style={cellStyle}>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user, e.target.value)}
                      style={{ background: '#0f172a', border: '1px solid #334155', color: '#cbd5e1', borderRadius: 4, padding: '3px 8px', fontSize: 12 }}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <button
                      onClick={() => handleToggleActivate(user)}
                      style={{
                        padding: '3px 10px', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                        background: user.activatedAt ? '#052e16' : '#450a0a',
                        color: user.activatedAt ? '#86efac' : '#fca5a5',
                      }}
                    >
                      {user.activatedAt ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td style={{ ...cellStyle, display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleShowDetail(user)}
                      style={{ padding: '3px 8px', background: '#1d4ed8', border: 'none', borderRadius: 4, color: '#bfdbfe', cursor: 'pointer', fontSize: 11 }}
                    >
                      상세
                    </button>
                    <button
                      onClick={() => { setPwModal({ email: user.email }); setPwError(''); setNewPw(''); }}
                      style={{ padding: '3px 8px', background: '#854d0e', border: 'none', borderRadius: 4, color: '#fef08a', cursor: 'pointer', fontSize: 11 }}
                    >
                      비번변경
                    </button>
                    <button
                      onClick={() => handleDelete(user)}
                      style={{ padding: '3px 8px', background: '#7f1d1d', border: 'none', borderRadius: 4, color: '#fca5a5', cursor: 'pointer', fontSize: 11 }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} style={{ ...cellStyle, textAlign: 'center', color: '#64748b' }}>유저가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {meta && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button
            disabled={!meta.hasPreviousPage}
            onClick={() => setPage(p => p - 1)}
            style={{ padding: '6px 14px', background: meta.hasPreviousPage ? '#334155' : '#1e293b', border: 'none', borderRadius: 6, color: meta.hasPreviousPage ? '#94a3b8' : '#475569', cursor: meta.hasPreviousPage ? 'pointer' : 'not-allowed', fontSize: 13 }}
          >
            이전
          </button>
          <span style={{ color: '#64748b', fontSize: 13 }}>{page} / {meta.pageCount}</span>
          <button
            disabled={!meta.hasNextPage}
            onClick={() => setPage(p => p + 1)}
            style={{ padding: '6px 14px', background: meta.hasNextPage ? '#334155' : '#1e293b', border: 'none', borderRadius: 6, color: meta.hasNextPage ? '#94a3b8' : '#475569', cursor: meta.hasNextPage ? 'pointer' : 'not-allowed', fontSize: 13 }}
          >
            다음
          </button>
        </div>
      )}

      {(detailUser || detailLoading) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 28, minWidth: 340, border: '1px solid #334155' }}>
            <h4 style={{ color: '#f1f5f9', marginBottom: 16, fontSize: 16 }}>유저 상세</h4>
            {detailLoading ? (
              <p style={{ color: '#64748b' }}>불러오는 중...</p>
            ) : detailUser && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(detailUser).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 12 }}>
                    <span style={{ color: '#64748b', minWidth: 100, fontSize: 12 }}>{k}</span>
                    <span style={{ color: '#cbd5e1', fontSize: 13 }}>{String(v ?? '-')}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setDetailUser(null)}
              style={{ marginTop: 20, padding: '8px 20px', background: '#334155', border: 'none', borderRadius: 6, color: '#94a3b8', cursor: 'pointer' }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {pwModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 28, minWidth: 320, border: '1px solid #334155' }}>
            <h4 style={{ color: '#f1f5f9', marginBottom: 8, fontSize: 16 }}>비밀번호 변경</h4>
            <p style={{ color: '#64748b', fontSize: 12, marginBottom: 16 }}>{pwModal.email}</p>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="새 비밀번호"
              style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }}
            />
            {pwError && <p style={{ color: '#fca5a5', fontSize: 12, marginBottom: 8 }}>{pwError}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleChangePassword}
                disabled={pwLoading}
                style={{ flex: 1, padding: '9px', background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 14 }}
              >
                {pwLoading ? '변경 중...' : '변경'}
              </button>
              <button
                onClick={() => { setPwModal(null); setNewPw(''); }}
                style={{ flex: 1, padding: '9px', background: '#334155', border: 'none', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
