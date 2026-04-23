import { createEcmaScriptPlugin, runNodeJs } from '@bufbuild/protoplugin';

const plugin = createEcmaScriptPlugin({
	name: 'gen-entry',
	version: 'v1',
	generateTs(schema) {
		const entries: string[] = [];

		for (const file of schema.files) {
			const fileName = file.name + '_pb'; // copy from @bufbuild/protoc-gen-es
			const content = `export * from './${fileName}';`;
			entries.push(content);
		}

		const f = schema.generateFile('index.ts');
		f.print(entries.join('\n'));
	},
});

runNodeJs(plugin);
