/* eslint-disable no-magic-numbers */
import nock from 'nock';
import { resolve } from 'path';
import {
	generateContext,
	testEnv,
	testFs,
	disableNetConnect,
	spyOnStdout,
	stdoutCalledWith,
	testChildProcess, stdoutContains,
} from '@technote-space/github-action-test-helper';
import { Logger } from '@technote-space/github-action-helper';
import { clearCache } from '../src/utils/command';
import { main, run } from '../src';
import { MainArguments } from '../src/types';

testFs();
beforeEach(() => {
	Logger.resetForTesting();
	clearCache();
});

const mainArgs = (override?: object): MainArguments => Object.assign({}, {
	actionName: 'test-action',
	actionOwner: 'hello',
	actionRepo: 'world',
}, override ?? {});

describe('main', () => {
	disableNetConnect(nock);
	testEnv();
	testChildProcess();

	it('should do nothing', async() => {
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		await main(mainArgs({
			rootDir: resolve(__dirname, 'fixtures'),
			context: generateContext({
				owner: 'hello',
				repo: 'world',
				event: 'issues',
				action: 'create',
			}),
			targetBranchPrefix: 'prefix/',
		}));

		stdoutCalledWith(mockStdout, [
			'',
			'==================================================',
			'Event:    issues',
			'Action:   create',
			'sha:      ',
			'ref:      ',
			'owner:    hello',
			'repo:     world',
			'',
			'::group::Dump context',
			'{\n\t"payload": {\n\t\t"action": "create"\n\t},\n\t"eventName": "issues",\n\t"sha": "",\n\t"ref": "",\n\t"workflow": "",\n\t"action": "hello-generator",\n\t"actor": "",\n\t"issue": {\n\t\t"owner": "hello",\n\t\t"repo": "world"\n\t},\n\t"repo": {\n\t\t"owner": "hello",\n\t\t"repo": "world"\n\t}\n}',
			'::endgroup::',
			'::group::Dump Payload',
			'{\n	"action": "create"\n}',
			'::endgroup::',
			'==================================================',
			'',
			'> This is not target event.',
		]);
	});

	it('should call execute', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => []);

		await main(mainArgs({
			rootDir: resolve(__dirname, 'fixtures'),
			context: generateContext({
				owner: 'hello',
				repo: 'world',
				event: 'schedule',
				action: '',
			}),
			checkDefaultBranch: false,
			logger: new Logger(),
		}));

		stdoutContains(mockStdout, [
			'',
			'==================================================',
			'Action:',
			'sha:',
			'ref:',
			'owner:    hello',
			'repo:     world',
			'',
			'::group::Dump context',
			'{\n\t"payload": {\n\t\t"action": ""\n\t},\n\t"eventName": "schedule",\n\t"sha": "",\n\t"ref": "",\n\t"workflow": "",\n\t"action": "hello-generator",\n\t"actor": "",\n\t"issue": {\n\t\t"owner": "hello",\n\t\t"repo": "world"\n\t},\n\t"repo": {\n\t\t"owner": "hello",\n\t\t"repo": "world"\n\t}\n}',
			'::endgroup::',
			'::group::Dump Payload',
			'{\n	"action": ""\n}',
			'::endgroup::',
			'==================================================',
			'',
			'::group::Total:0  Succeeded:0  Failed:0  Skipped:0',
			'::endgroup::',
		]);
	});
});

describe('run', () => {
	disableNetConnect(nock);
	testEnv();
	testChildProcess();

	it('should call main', () => {
		process.env.GITHUB_REPOSITORY = 'hello/world';
		const mockStdout              = spyOnStdout();

		run(mainArgs({
			targetBranchPrefix: 'prefix/',
			notTargetEventMessage: 'test message',
		}));

		stdoutCalledWith(mockStdout, [
			'> test message',
		]);
	});

	it('should catch error', () => {
		process.env.GITHUB_REPOSITORY = 'hello/world';
		const mockStdout              = spyOnStdout();
		const fn                      = jest.fn();

		/**
		 * logger for test
		 */
		class TestLogger extends Logger {
			public info = (): void => {
				fn();
				throw new Error('test error');
			};
		}

		run(mainArgs({
			targetBranchPrefix: 'prefix/',
			logger: new TestLogger(),
		}));

		expect(fn).toBeCalledTimes(1);
		stdoutCalledWith(mockStdout, []);
	});
});
