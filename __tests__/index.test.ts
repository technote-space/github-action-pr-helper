/* eslint-disable no-magic-numbers */
import nock from 'nock';
import {resolve} from 'path';
import {Logger} from '@technote-space/github-action-helper';
import {
  generateContext,
  testEnv,
  testFs,
  disableNetConnect,
  spyOnStdout,
  stdoutCalledWith,
  testChildProcess,
  getApiFixture,
  getLogStdout,
} from '@technote-space/github-action-test-helper';
import {main} from '../src';
import {MainArguments} from '../src/types';

testFs();
beforeEach(() => {
  Logger.resetForTesting();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mainArgs = (override?: { [key: string]: any }): MainArguments => Object.assign({}, {
  actionName: 'test-action',
  actionOwner: 'hello',
  actionRepo: 'world',
}, override ?? {});
const rootDir  = resolve(__dirname, 'fixtures');

describe('main', () => {
  disableNetConnect(nock);
  testEnv();
  testChildProcess();

  it('should do nothing 1', async() => {
    process.env.GITHUB_REPOSITORY  = 'hello/world';
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();

    nock('https://api.github.com')
      .persist()
      .get('/repos/hello/world')
      .reply(200, () => getApiFixture(rootDir, 'repos.get'));

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
      getLogStdout({
        'payload': {
          'action': 'create',
        },
        'eventName': 'issues',
        'sha': '',
        'ref': '',
        'workflow': '',
        'action': 'hello-generator',
        'actor': '',
        'issue': {
          'owner': 'hello',
          'repo': 'world',
        },
        'repo': {
          'owner': 'hello',
          'repo': 'world',
        },
        'job': '',
        'runNumber': 1,
        'runId': 1,
      }),
      '::endgroup::',
      '::group::Dump Payload',
      '{\n	"action": "create"\n}',
      '::endgroup::',
      '==================================================',
      '',
      '> This is not target event.',
    ]);
  });

  it('should do nothing 2', async() => {
    process.env.GITHUB_REPOSITORY  = 'hello/world';
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();

    nock('https://api.github.com')
      .persist()
      .get('/repos/hello/world')
      .reply(200, () => getApiFixture(rootDir, 'repos.get'));

    await main(mainArgs({
      context: generateContext({
        owner: 'hello',
        repo: 'world',
        event: 'issues',
        action: 'create',
      }),
      targetBranchPrefix: 'prefix/',
      notTargetEventMessage: 'test message',
    }));

    stdoutCalledWith(mockStdout, [
      '> test message',
    ]);
  });

  it('should call execute', async() => {
    process.env.GITHUB_WORKSPACE   = resolve('test');
    process.env.GITHUB_REPOSITORY  = 'hello/world';
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();

    nock('https://api.github.com')
      .persist()
      .get('/repos/hello/world')
      .reply(200, () => getApiFixture(rootDir, 'repos.get'))
      .get('/repos/hello/world/pulls?sort=created&direction=asc')
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

    stdoutCalledWith(mockStdout, [
      '',
      '==================================================',
      'Event:    schedule',
      'Action:   ',
      'sha:      ',
      'ref:      ',
      'owner:    hello',
      'repo:     world',
      '',
      '::group::Dump context',
      getLogStdout({
        'payload': {
          'action': '',
        },
        'eventName': 'schedule',
        'sha': '',
        'ref': '',
        'workflow': '',
        'action': 'hello-generator',
        'actor': '',
        'issue': {
          'owner': 'hello',
          'repo': 'world',
        },
        'repo': {
          'owner': 'hello',
          'repo': 'world',
        },
        'job': '',
        'runNumber': 1,
        'runId': 1,
      }),
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
