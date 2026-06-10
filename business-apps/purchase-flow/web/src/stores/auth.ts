import { defineStore } from 'pinia';
import { type DirectusUser, getCurrentUser, login as loginRequest, logout as logoutRequest } from '../api/auth';
import { ACCESS_TOKEN_KEY } from '../api/http';

export type RoleScope = 'Sales' | 'Buyer' | 'Manager' | 'Unknown';

const REFRESH_TOKEN_KEY = 'purchase-flow.refresh-token';

function getRoleName(user: DirectusUser | null) {
	if (!user?.role) return '';
	if (typeof user.role === 'string') return user.role;

	return user.role.name || '';
}

export function mapRoleScope(roleName: string): RoleScope {
	if (/采购|buyer/i.test(roleName)) return 'Buyer';
	if (/外贸|销售|sales/i.test(roleName)) return 'Sales';
	if (/manager|管理|经理/i.test(roleName)) return 'Manager';

	return 'Unknown';
}

export const useAuthStore = defineStore('auth', {
	state: () => ({
		accessToken: window.localStorage.getItem(ACCESS_TOKEN_KEY) || '',
		refreshToken: window.localStorage.getItem(REFRESH_TOKEN_KEY) || '',
		currentUser: null as DirectusUser | null,
		loading: false,
		error: '',
	}),
	getters: {
		isAuthenticated: (state) => Boolean(state.accessToken),
		roleScope: (state): RoleScope => mapRoleScope(getRoleName(state.currentUser)),
		userName: (state) => {
			const names = [state.currentUser?.first_name, state.currentUser?.last_name].filter(Boolean).join(' ');

			return names || state.currentUser?.email || '当前用户';
		},
	},
		actions: {
		setTokens(accessToken: string, refreshToken = '') {
			this.accessToken = accessToken;
			this.refreshToken = refreshToken;
			window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);

			if (refreshToken) window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
		},
		clearSession() {
			this.accessToken = '';
			this.refreshToken = '';
			this.currentUser = null;
			window.localStorage.removeItem(ACCESS_TOKEN_KEY);
			window.localStorage.removeItem(REFRESH_TOKEN_KEY);
		},
		async loadCurrentUser() {
			this.currentUser = await getCurrentUser();
		},
		async ensureCurrentUser() {
			if (!this.accessToken) return false;
			if (this.currentUser?.id) return true;

			try {
				await this.loadCurrentUser();

				return Boolean(this.currentUser?.id);
			} catch (error) {
				this.clearSession();
				this.error = error instanceof Error ? error.message : '无法识别当前用户，请重新登录。';

				return false;
			}
		},
		async login(email: string, password: string) {
			this.loading = true;
			this.error = '';

			try {
				const token = await loginRequest(email, password);
				this.setTokens(token.access_token, token.refresh_token);
				await this.loadCurrentUser();
			} catch (error) {
				this.clearSession();
				this.error = error instanceof Error ? error.message : '登录失败';
				throw error;
			} finally {
				this.loading = false;
			}
		},
		async logout() {
			try {
				if (this.refreshToken) await logoutRequest(this.refreshToken);
			} finally {
				this.clearSession();
			}
		},
	},
});
