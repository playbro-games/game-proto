import type { Schema } from '@bufbuild/protoplugin';
import { baseOpenApi } from './config';
import { createPathsForService, createSchemasRegistry, resolveUsedSchemas } from './mapper';
import type { OpenAPIV3_1 } from 'openapi-types';

export function buildOpenApi(schema: Schema) {
	const doc = structuredClone(baseOpenApi);

	const allSchemas = createSchemasRegistry(schema.files);

	for (const file of schema.files) {
		for (const service of file.services) {
			const paths = createPathsForService(service);
			doc.paths = { ...doc.paths, ...paths };
		}
	}

	const rootNames = getComponentNamesSet(doc.paths);

	const usedSchemas = resolveUsedSchemas(allSchemas, rootNames);

	doc.components ??= {};
	doc.components.schemas = usedSchemas;

	return doc;
}

const getComponentNamesFromPath = (operation?: OpenAPIV3_1.OperationObject): string[] => {
	if (!operation) return [];

	const { requestBody, responses } = operation;
	const componentNames: string[] = [];

	if (requestBody && 'content' in requestBody) {
		for (const contentType in requestBody.content) {
			const schemaRef = requestBody.content[contentType]?.schema;
			if (schemaRef && '$ref' in schemaRef) {
				const refName = schemaRef.$ref.split('/').pop();
				if (refName) componentNames.push(refName);
			}
		}
	}

	if (responses) {
		for (const statusCode in responses) {
			const response = responses[statusCode];
			if (response && 'content' in response) {
				for (const contentType in response.content) {
					const schemaRef = response.content[contentType]?.schema;
					if (schemaRef && '$ref' in schemaRef) {
						const refName = schemaRef.$ref.split('/').pop();
						if (refName) componentNames.push(refName);
					}
				}
			}
		}
	}

	return componentNames;
};

const getComponentNamesSet = (pathObjects?: OpenAPIV3_1.PathsObject): ReadonlySet<string> => {
	const components = Object.values(pathObjects ?? {}).reduce<string[]>((acc, pathObject) => {
		return [
			...acc,
			...getComponentNamesFromPath(pathObject?.post),
			...getComponentNamesFromPath(pathObject?.get),
			...getComponentNamesFromPath(pathObject?.put),
			...getComponentNamesFromPath(pathObject?.delete),
			...getComponentNamesFromPath(pathObject?.patch),
			...getComponentNamesFromPath(pathObject?.options),
			...getComponentNamesFromPath(pathObject?.head),
			...getComponentNamesFromPath(pathObject?.trace),
		];
	}, []);
	return new Set(components);
};
