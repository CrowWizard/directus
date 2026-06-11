import { http } from './http';

export type DirectusUser = {
	id: string;
	email?: string;
	first_name?: string | null;
	last_name?: string | null;
	role?: { id?: string; name?: string | null } | string | null;
};

export type LoginResult = {
	access_token: string;
	refresh_token?: string;
};

const userFields = ['id', 'email', 'first_name', 'last_name', 'role.name'];

export async function login(email: string, password: string) {
	const response = await http.post<{ data: LoginResult }>('/auth/login', { email, password, mode: 'json' });

	return response.data.data;
}

export async function refresh() {
	const response = await http.post<{ data: LoginResult }>('/auth/refresh');

	return response.data.data;
}

export async function logout(refreshToken: string) {
	await http.post('/auth/logout', { refresh_token: refreshToken });
}

export async function getCurrentUser() {
	const response = await http.get<{ data: DirectusUser }>('/users/me', { params: { fields: userFields } });

	return response.data.data;
}
