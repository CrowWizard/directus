import { AxiosError } from 'axios';
import { beforeEach, describe, expect, test } from 'vitest';
import { ACCESS_TOKEN_KEY, http } from './http';

describe('http client', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	test('clears stored tokens and shows friendly message when token is expired', async () => {
		window.localStorage.setItem(ACCESS_TOKEN_KEY, 'expired-token');
		window.localStorage.setItem('purchase-flow.refresh-token', 'refresh-token');

		const originalAdapter = http.defaults.adapter;

		http.defaults.adapter = async (config) => {
			throw new AxiosError(
				'Request failed with status code 401',
				'ERR_BAD_REQUEST',
				config,
				undefined,
				{
					config,
					data: { errors: [{ message: 'Token expired.', extensions: { code: 'TOKEN_EXPIRED' } }] },
					headers: {},
					status: 401,
					statusText: 'Unauthorized',
					request: {},
				},
			);
		};


		try {
			await expect(http.get('/items/inquiry_items')).rejects.toThrow('登录已过期，请重新登录。');

			expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
			expect(window.localStorage.getItem('purchase-flow.refresh-token')).toBeNull();
		} finally {
			http.defaults.adapter = originalAdapter;
		}
	});
});
