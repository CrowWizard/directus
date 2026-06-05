import axios from 'axios';

const ACCESS_TOKEN_KEY = 'purchase-flow.access-token';

export const http = axios.create({
	baseURL: import.meta.env.VITE_DIRECTUS_URL || 'http://localhost:8055',
});

http.interceptors.request.use((config) => {
	const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);

	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}

	return config;
});

export { ACCESS_TOKEN_KEY };
