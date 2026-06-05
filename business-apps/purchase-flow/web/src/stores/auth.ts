import { defineStore } from 'pinia';

export const useAuthStore = defineStore('auth', {
	state: () => ({
		accessToken: window.localStorage.getItem('purchase-flow.access-token') || '',
	}),
	getters: {
		isAuthenticated: (state) => Boolean(state.accessToken),
	},
});
