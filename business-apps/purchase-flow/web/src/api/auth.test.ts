import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useAuthStore } from '../stores/auth';
import { http } from './http';

vi.mock('./http', () => ({
	ACCESS_TOKEN_KEY: 'purchase-flow.access-token',
	http: {
		get: vi.fn(),
		post: vi.fn(),
	},
}));

const mockHttp = http as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

describe('auth store', () => {
	beforeEach(() => {
		window.localStorage.clear();
		setActivePinia(createPinia());
		vi.clearAllMocks();
	});

	test('logs in and loads current user', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { access_token: 'token-1', refresh_token: 'refresh-1' } } });
		mockHttp.get.mockResolvedValueOnce({ data: { data: { id: 'user-1', role: { name: '采购员' } } } });

		const auth = useAuthStore();
		await auth.login('buyer1@example.com', '12345678');

		expect(auth.accessToken).toBe('token-1');
		expect(auth.roleScope).toBe('Buyer');
	});

	test('sends refresh token when logging out', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { access_token: 'token-1', refresh_token: 'refresh-1' } } });
		mockHttp.get.mockResolvedValueOnce({ data: { data: { id: 'user-1', role: { name: '采购员' } } } });
		mockHttp.post.mockResolvedValueOnce({ data: {} });

		const auth = useAuthStore();
		await auth.login('buyer1@example.com', '12345678');
		await auth.logout();

		expect(mockHttp.post).toHaveBeenLastCalledWith('/auth/logout', { refresh_token: 'refresh-1' });
		expect(auth.accessToken).toBe('');
		expect(auth.refreshToken).toBe('');
	});

	test('clears stale tokens when current user cannot be loaded', async () => {
		window.localStorage.setItem('purchase-flow.access-token', 'stale-token');
		mockHttp.get.mockRejectedValueOnce(new Error('Unauthorized'));

		const auth = useAuthStore();
		const validSession = await auth.ensureCurrentUser();

		expect(validSession).toBe(false);
		expect(auth.accessToken).toBe('');
		expect(auth.currentUser).toBeNull();
		expect(window.localStorage.getItem('purchase-flow.access-token')).toBeNull();
	});
});
