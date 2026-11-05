import js from '@eslint/js';
import pluginPromise from 'eslint-plugin-promise';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
	{
		name: 'projectfu/tooling',
		files: ['tools/*.mjs'],
		plugins: { js },
		extends: ['js/recommended'],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	{
		name: 'projectfu/system',
		files: ['**/*.{js,mjs,cjs}'],
		ignores: ['tools/*.mjs'],
		plugins: { js, pluginPromise },
		extends: ['js/recommended', pluginPromise.configs['flat/recommended']],
		rules: {
			'no-unused-vars': [
				'error',
				{
					args: 'none',
					caughtErrors: 'none',
				},
			],
		},
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.jquery,
				ActiveEffect: 'readonly',
				Actor: 'readonly',
				CONFIG: 'readonly',
				CONST: 'readonly',
				ChatMessage: 'readonly',
				Combat: 'readonly',
				Combatant: 'readonly',
				Folder: 'readonly',
				Handlebars: 'readonly',
				Hooks: 'readonly',
				Item: 'readonly',
				JournalEntry: 'readonly',
				Macro: 'readonly',
				Roll: 'readonly',
				RollTable: 'readonly',
				canvas: 'readonly',
				foundry: 'readonly',
				fromUuid: 'readonly',
				game: 'readonly',
				getDocumentClass: 'readonly',
				ui: 'readonly',
				fromUuidSync: 'readonly',
				_loc: 'readonly',
			},
		},
	},
]);
