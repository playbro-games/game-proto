import {
	getExtension,
	type DescField,
	type DescFile,
	type DescMessage,
	type DescService,
	ScalarType,
	type DescMethod,
} from '@bufbuild/protobuf';
import { type OpenAPIV3_1 } from 'openapi-types';
import { type HttpRule } from '@buf/googleapis_googleapis.bufbuild_es/google/api/http_pb';
import { http } from '@buf/googleapis_googleapis.bufbuild_es/google/api/annotations_pb';

type SchemaMap = Record<string, OpenAPIV3_1.SchemaObject>;

export function cleanComment(raw: string): string | undefined {
	return raw
		.replace(/^\s*\/\*\*?/, '')
		.replace(/\*\/\s*$/, '')
		.split('\n')
		.map((line) => line.trim())
		.map((line) => line.replace(/^\*\s?/, ''))
		.join('\n')
		.trim();
}

/*
	Сущность	Путь (Path)
	Service	[6, service_index]
	Method	[6, service_index, 2, method_index]
	Message	[4, message_index]
	Field	[4, message_index, 2, field_index]
	Enum	[5, enum_index]
	EnumValue	[5, enum_index, 2, value_index]
*/
function getMethodComment(method: DescMethod): string | undefined {
	const file = method.parent.file;
	const locations = file.proto.sourceCodeInfo?.location ?? [];

	const service = method.parent;

	const serviceIndex = file.services.indexOf(service);
	const methodIndex = service.methods.indexOf(method);

	for (const loc of locations) {
		if (
			loc.path.length === 4 &&
			loc.path[0] === 6 && // service
			loc.path[1] === serviceIndex &&
			loc.path[2] === 2 && // method
			loc.path[3] === methodIndex
		) {
			return cleanComment(loc.leadingComments);
		}
	}

	return undefined;
}

function getHttpRules(method: DescMethod): HttpRule['pattern'][] | null {
	const { options } = method.proto;
	if (!options) return null;
	const mainHttpRule = getExtension(options, http);
	const result = [mainHttpRule.pattern];
	for (const additionalHttpRule of mainHttpRule.additionalBindings) {
		result.push(additionalHttpRule.pattern);
	}
	return result;
}

function normalizePath(path: string): string {
	return path.startsWith('/') ? path : `/${path}`;
}

export function createPathsForService(service: DescService): OpenAPIV3_1.PathsObject {
	const paths: OpenAPIV3_1.PathsObject = {};

	for (const method of service.methods) {
		const description = getMethodComment(method);

		for (const { case: httpType, value = '' } of getHttpRules(method) ?? []) {
			if (!httpType || httpType === 'custom') continue;

			const methodName = normalizePath(typeof value === 'string' ? value : value.path);

			let pathObject = paths[methodName];

			if (!pathObject) {
				pathObject = {};
				paths[methodName] = pathObject;
			}

			pathObject[httpType] = {
				operationId: method.localName,
				summary: method.name,
				description,
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								$ref: `#/components/schemas/${method.input.name}`,
							},
						},
						'application/x-protobuf': {
							schema: {
								type: 'string',
								format: 'binary',
								description: `Protobuf binary format. The content should be the binary serialization of the ${method.input.name} message.`,
							},
						},
					},
				},
				responses: {
					'200': {
						description: 'OK',
						content: {
							'application/json': {
								schema: {
									$ref: `#/components/schemas/${method.output.name}`,
								},
							},
							'application/x-protobuf': {
								schema: {
									type: 'string',
									format: 'binary',
									description: `Protobuf binary format. The content should be the binary serialization of the ${method.output.name} message.`,
								},
							},
						},
					},
					'400': {
						description: 'Bad Request',
					},
				},
			};
		}
	}
	return paths;
}

export function createSchemasRegistry(files: readonly DescFile[]): SchemaMap {
	const schemas: SchemaMap = {};

	for (const file of files) {
		for (const message of file.messages) {
			schemas[message.name] = createSchemaObject(message);
		}
	}

	return schemas;
}

function createSchemaObject(message: DescMessage): OpenAPIV3_1.SchemaObject {
	const properties: Record<string, OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject> = {};

	for (const field of message.fields) {
		properties[field.name] = mapField(field);
	}

	const base: OpenAPIV3_1.SchemaObject = {
		type: 'object',
		properties,
	};

	return applyOneOf(message, base);
}

function mapField(field: DescField): OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject {
	switch (field.fieldKind) {
		case 'scalar':
			return mapScalar(field.scalar);

		case 'enum':
			return {
				type: 'string',
				enum: field.enum.values.map((v) => v.name),
			};

		case 'message':
			return mapMessage(field);

		case 'list':
			return {
				type: 'array',
				items: mapListValue(field),
			};

		case 'map':
			return {
				type: 'object',
				additionalProperties: mapMapValue(field),
			};

		default:
			return { type: 'string' };
	}
}

function mapMapValue(
	field: Extract<DescField, { fieldKind: 'map' }>,
): OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject {
	switch (field.mapKind) {
		case 'scalar':
			return mapScalar(field.scalar);

		case 'enum':
			return {
				type: 'string',
				enum: field.enum.values.map((v) => v.name),
			};

		case 'message':
			return {
				$ref: `#/components/schemas/${field.message.name}`,
			};
	}
}

function mapScalar(type: ScalarType): OpenAPIV3_1.NonArraySchemaObject {
	switch (type) {
		case ScalarType.STRING:
			return { type: 'string' };

		case ScalarType.BOOL:
			return { type: 'boolean' };

		case ScalarType.INT32:
		case ScalarType.UINT32:
			return { type: 'integer', format: 'int32' };

		case ScalarType.INT64:
		case ScalarType.UINT64:
			return { type: 'string', format: 'int64' };

		case ScalarType.FLOAT:
			return { type: 'number', format: 'float' };

		case ScalarType.DOUBLE:
			return { type: 'number', format: 'double' };

		case ScalarType.BYTES:
			return { type: 'string', format: 'byte' };

		default:
			return { type: 'string' };
	}
}

function mapMessage(field: DescField): OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject {
	const typeName = field.message?.typeName;

	if (!typeName) {
		throw new Error(`Message type is missing for field ${field.name}`);
	}

	switch (typeName) {
		case 'google.protobuf.Timestamp':
			return { type: 'string', format: 'date-time' };

		case 'google.protobuf.StringValue':
			return { type: 'string' };

		case 'google.protobuf.Int32Value':
			return { type: 'integer' };

		case 'google.protobuf.BoolValue':
			return { type: 'boolean' };

		case 'google.protobuf.Struct':
			return { type: 'object', additionalProperties: true };

		case 'google.protobuf.Value':
			return {};

		default:
			return {
				$ref: `#/components/schemas/${field.message.name}`,
			};
	}
}

export function collectRefs(schema: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject, acc: Set<string>) {
	if (!schema) return;

	if ('$ref' in schema) {
		const name = schema.$ref.split('/').pop();
		if (name) acc.add(name);
		return;
	}

	if (schema.type === 'array' && schema.items) {
		collectRefs(schema.items, acc);
	}

	if (schema.type === 'object') {
		if (schema.properties) {
			for (const v of Object.values(schema.properties)) {
				collectRefs(v, acc);
			}
		}

		if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
			collectRefs(schema.additionalProperties, acc);
		}
	}

	if (schema.oneOf || schema.allOf || schema.anyOf) {
		for (const s of [...(schema.oneOf ?? []), ...(schema.allOf ?? []), ...(schema.anyOf ?? [])]) {
			collectRefs(s, acc);
		}
	}
}

export function resolveUsedSchemas(allSchemas: SchemaMap, rootNames: ReadonlySet<string>): SchemaMap {
	const visited = new Set<string>();
	const queue = [...rootNames];

	while (queue.length) {
		const name = queue.pop()!;
		if (visited.has(name)) continue;

		visited.add(name);

		const schema = allSchemas[name];
		if (!schema) continue;

		const refs = new Set<string>();
		collectRefs(schema, refs);

		for (const ref of refs) {
			if (!visited.has(ref)) queue.push(ref);
		}
	}

	return Object.fromEntries(Object.entries(allSchemas).filter(([k]) => visited.has(k)));
}

function applyOneOf(message: DescMessage, base: OpenAPIV3_1.SchemaObject): OpenAPIV3_1.SchemaObject {
	if (message.oneofs.length === 0) return base;

	return {
		...base,
		allOf: message.oneofs.map((oneof) => ({
			oneOf: oneof.fields.map((f) => ({
				type: 'object',
				required: [f.name],
				properties: {
					[f.name]: mapField(f),
				},
			})),
		})),
	};
}

function mapListValue(
	field: Extract<DescField, { fieldKind: 'list' }>,
): OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject {
	switch (field.listKind) {
		case 'scalar':
			return mapScalar(field.scalar);

		case 'enum':
			return {
				type: 'string',
				enum: field.enum.values.map((v) => v.name),
			};

		case 'message':
			return {
				$ref: `#/components/schemas/${field.message.name}`,
			};
	}
}
