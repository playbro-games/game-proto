import { createEcmaScriptPlugin, runNodeJs } from '@bufbuild/protoplugin';
import { stringify as yamlStringify } from 'yaml';
import { buildOpenApi } from './openapi';

const plugin = createEcmaScriptPlugin({
	name: 'protoc-gen-openapi',
	version: 'v1',
	generateTs(schema) {
		const openapi = buildOpenApi(schema);
		const f = schema.generateFile('openapi.yaml');
		f.print(yamlStringify(openapi));
	},
});

runNodeJs(plugin);
