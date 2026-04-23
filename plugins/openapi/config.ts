import type { OpenAPIV3_1 } from 'openapi-types';

export const baseOpenApi: OpenAPIV3_1.Document = {
	openapi: '3.1.0',
	info: {
		title: 'Game API',
		version: '1.0.0',
		license: {
			name: 'MIT License',
			identifier: 'MIT',
		},
	},
	security: [{ bearerAuth: [] }],
	servers: [
		{
			url: 'https://zonk-test.3th.click',
			description: 'Dev server',
		},
	],
	paths: {},
	components: {
		securitySchemes: {
			bearerAuth: {
				type: 'http',
				scheme: 'bearer',
			},
		},
		schemas: {},
	},
};
