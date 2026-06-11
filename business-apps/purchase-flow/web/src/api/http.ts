import axios from 'axios';

const ACCESS_TOKEN_KEY = 'purchase-flow.access-token';
const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'http://localhost:8055';

export const http = axios.create({
	baseURL: DIRECTUS_URL,
});

function getDirectusErrorCode(error: unknown) {
	if (!axios.isAxiosError(error)) return '';

	return error.response?.data?.errors?.[0]?.extensions?.code || '';
}

function getDirectusErrorMessage(error: unknown) {
	if (!axios.isAxiosError(error)) return '';

	return error.response?.data?.errors?.[0]?.message || '';
}

function clearStoredTokens() {
	window.localStorage.removeItem(ACCESS_TOKEN_KEY);
	window.localStorage.removeItem('purchase-flow.refresh-token');
}

http.interceptors.request.use((config) => {
	const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);

	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}

	return config;
});

http.interceptors.response.use(
	(response) => response,
	(error) => {
		const code = getDirectusErrorCode(error);
		const message = getDirectusErrorMessage(error);

		if (code === 'TOKEN_EXPIRED' || message === 'Token expired.') {
			clearStoredTokens();
			throw new Error('登录已过期，请重新登录。');
		}

		throw error;
	},
);

export { ACCESS_TOKEN_KEY, DIRECTUS_URL };
