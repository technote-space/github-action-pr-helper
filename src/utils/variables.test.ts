/* eslint-disable no-magic-numbers */
import { beforeEach, describe, expect, it } from 'vitest';
import {Context} from '@actions/github/lib/context';
import moment from 'moment';
import nock from 'nock';
import {resolve} from 'path';
import {Logger} from '@technote-space/github-action-log-helper';
import {
  testEnv,
  generateContext,
  testChildProcess,
  testFs,
  getApiFixture,
  disableNetConnect,
  getOctokit,
} from '@technote-space/github-action-test-helper';
import {getCacheKey} from './misc';
import {
  getCommitMessage,
  getCommitName,
  getCommitEmail,
  getPrBranchName,
  getPrTitle,
  getPrLink,
  getPrBody,
} from './variables';
import {ActionContext, ActionDetails} from '../types';

beforeEach(() => {
  Logger.resetForTesting();
});
const octokit   = getOctokit();
const rootDir   = resolve(__dirname, '..', 'fixtures');
const setExists = testFs(true);

const actionDetails: ActionDetails = {
  actionName: 'Test Action',
  actionOwner: 'octocat',
  actionRepo: 'hello-world',
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getActionContext             = (context: Context, _actionDetails?: ActionDetails, defaultBranch?: string, cache?: { [key: string]: any }, isBatchProcess?: boolean): ActionContext => ({
  actionContext: context,
  actionDetail: _actionDetails ?? actionDetails,
  cache: Object.assign(cache ?? {}, {
    [getCacheKey('repos', {owner: context.repo.owner, repo: context.repo.repo})]: defaultBranch ?? 'master',
    [getCacheKey('current-version')]: 'v1.2.3',
    [getCacheKey('new-patch-version')]: 'v1.2.4',
    [getCacheKey('new-minor-version')]: 'v1.3.0',
    [getCacheKey('new-major-version')]: 'v2.0.0',
  }),
  isBatchProcess,
});
const generateActionContext        = (
  settings: {
    event?: string | undefined;
    action?: string | undefined;
    ref?: string | undefined;
    sha?: string | undefined;
    owner?: string | undefined;
    repo?: string | undefined;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override?: { [key: string]: any },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _actionDetails?: { [key: string]: any },
  defaultBranch?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cache?: { [key: string]: any },
  isBatchProcess?: boolean,
): ActionContext => getActionContext(
  generateContext(settings, override),
  _actionDetails ? Object.assign({}, actionDetails, _actionDetails) : undefined,
  defaultBranch,
  cache,
  isBatchProcess,
);
const prPayload                    = {
  'pull_request': {
    number: 11,
    id: 21031067,
    head: {
      ref: 'feature/new-feature',
    },
    base: {
      ref: 'master',
    },
    title: 'test title',
    'html_url': 'http://example.com',
  },
};

describe('getCommitMessage', () => {
  testEnv();

  it('should get commit message', () => {
    expect(getCommitMessage(generateActionContext({}, {}, {commitMessage: 'test'}))).toBe('test');
  });

  it('should throw error', () => {
    expect(() => getCommitMessage(generateActionContext({}))).toThrow();
  });
});

describe('getCommitName', () => {
  testEnv();

  it('should get commit name', () => {
    expect(getCommitName(generateActionContext({}, {}, {commitName: 'test'}))).toBe('test');
  });

  it('should get default commit name', () => {
    expect(getCommitName(generateActionContext({}, {actor: 'test-actor'}))).toBe('test-actor');
  });
});

describe('getCommitEmail', () => {
  testEnv();

  it('should get commit email', () => {
    expect(getCommitEmail(generateActionContext({}, {}, {commitEmail: 'test'}))).toBe('test');
  });

  it('should get default commit email', () => {
    expect(getCommitEmail(generateActionContext({}, {actor: 'test-actor'}))).toBe('test-actor@users.noreply.github.com');
  });
});

describe('getPrBranchName', () => {
  testEnv();
  testChildProcess();

  it('should get pr branch name', async() => {
    expect(await getPrBranchName(octokit, generateActionContext({event: 'pull_request'}, {
      payload: prPayload,
    }, {
      prBranchName: '${PR_NUMBER}::${PR_NUMBER_REF}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_TITLE}::${PR_URL}::${PR_MERGE_REF}::${PATCH_VERSION}::${MINOR_VERSION}::${MAJOR_VERSION}::${CURRENT_VERSION}::${PR_LINK}',
    }))).toBe('hello-world/11::#11::21031067::feature/new-feature::master::test title::http://example.com::feature/new-feature -> master::v1.2.4::v1.3.0::v2.0.0::v1.2.3::[test title](http://example.com)');
  });

  it('should get pr branch name for default branch 1', async() => {
    expect(await getPrBranchName(octokit, generateActionContext({
      owner: 'owner',
      repo: 'repo',
      event: 'pull_request',
      ref: 'refs/heads/master',
    }, {
      payload: {
        'pull_request': {
          number: 0,
          id: 21031067,
          head: {
            ref: 'master',
          },
          base: {
            ref: 'master',
          },
          title: 'test title',
          'html_url': 'http://example.com',
        },
      },
    }, {
      prBranchPrefix: 'prefix/',
      prBranchName: '${PR_NUMBER}::${PR_NUMBER_REF}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_TITLE}::${PR_URL}::${PR_MERGE_REF}::${PATCH_VERSION}::${MINOR_VERSION}::${MAJOR_VERSION}::${CURRENT_VERSION}::${PR_LINK}',
      prBranchPrefixForDefaultBranch: 'release/',
      prBranchNameForDefaultBranch: '${PATCH_VERSION}',
    }))).toBe('release/v1.2.4');
  });

  it('should get pr branch name for default branch 2', async() => {
    setExists(false);
    expect(await getPrBranchName(octokit, generateActionContext({
      owner: 'owner',
      repo: 'repo',
      event: 'pull_request',
      ref: 'refs/heads/master',
    }, {
      payload: {
        'pull_request': {
          number: 0,
          id: 21031067,
          head: {
            ref: 'master',
          },
          base: {
            ref: 'master',
          },
          title: 'test title',
          'html_url': 'http://example.com',
        },
      },
    }, {
      prBranchName: '${PR_NUMBER}::${PR_NUMBER_REF}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_TITLE}::${PR_URL}::${PR_MERGE_REF}::${PATCH_VERSION}::${MINOR_VERSION}::${MAJOR_VERSION}::${CURRENT_VERSION}::${PR_LINK}',
    }))).toBe('hello-world/0::https://github.com/owner/repo/tree/master::21031067::master::master::test title::http://example.com::master::v1.2.4::v1.3.0::v2.0.0::v1.2.3::[test title](http://example.com)');
  });

  it('should get push branch name', async() => {
    expect(await getPrBranchName(octokit, generateActionContext({event: 'push'}, {ref: 'refs/heads/test-ref'}, {
      prBranchName: '${PR_NUMBER}::${PR_NUMBER_REF}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_TITLE}::${PR_URL}::${PR_MERGE_REF}::${PATCH_VERSION}::${MINOR_VERSION}::${MAJOR_VERSION}::${CURRENT_VERSION}::${PR_LINK}',
    }))).toBe('test-ref');
  });

  it('should get run number', async() => {
    expect(await getPrBranchName(octokit, generateActionContext({}), true)).toBe('1');
  });

  it('should throw error', async() => {
    await expect(getPrBranchName(octokit, generateActionContext({event: 'pull_request'}, {}, {
      prBranchName: '${PR_NUMBER}::${PR_NUMBER_REF}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_TITLE}::${PR_URL}::${PR_MERGE_REF}::${PATCH_VERSION}::${MINOR_VERSION}::${MAJOR_VERSION}::${CURRENT_VERSION}::${PR_LINK}',
    }))).rejects.toThrow();
    await expect(getPrBranchName(octokit, generateActionContext({}))).rejects.toThrow();
  });
});

describe('getPrTitle', () => {
  testEnv();
  testChildProcess();
  disableNetConnect(nock);

  it('should get PR title', async() => {
    expect(await getPrTitle(octokit, generateActionContext({}, {payload: prPayload}, {
      prTitle: '${PR_NUMBER}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_MERGE_REF}::${PR_NUMBER_REF}::${PATCH_VERSION}::${MINOR_VERSION}::${MAJOR_VERSION}::${CURRENT_VERSION}::${PR_LINK}',
    }))).toBe('11::21031067::feature/new-feature::master::feature/new-feature -> master::#11::v1.2.4::v1.3.0::v2.0.0::v1.2.3::[test title](http://example.com)');
  });

  it('should get PR title for default branch 1', async() => {
    expect(await getPrTitle(octokit, generateActionContext({
      owner: 'owner',
      repo: 'repo',
      event: 'pull_request',
      ref: 'refs/heads/master',
    }, {
      payload: {
        'pull_request': {
          number: 0,
          id: 21031067,
          head: {
            ref: 'master',
          },
          base: {
            ref: 'master',
          },
          title: 'test title',
          'html_url': 'http://example.com',
        },
      },
    }, {
      prTitle: '${PR_NUMBER}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_MERGE_REF}::${PR_NUMBER_REF}::${PATCH_VERSION}::${MINOR_VERSION}::${MAJOR_VERSION}::${CURRENT_VERSION}::${PR_LINK}',
      prTitleForDefaultBranch: 'release/${PATCH_VERSION}',
    }))).toBe('release/v1.2.4');
  });

  it('should get PR title for default branch 2', async() => {
    expect(await getPrTitle(octokit, generateActionContext({
      owner: 'owner',
      repo: 'repo',
      event: 'pull_request',
      ref: 'refs/heads/master',
    }, {
      payload: {
        'pull_request': {
          number: 0,
          id: 21031067,
          head: {
            ref: 'master',
          },
          base: {
            ref: 'master',
          },
          title: 'test title',
          'html_url': 'http://example.com',
        },
      },
    }, {
      prTitle: '${PR_NUMBER}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_MERGE_REF}::${PR_NUMBER_REF}::${PATCH_VERSION}::${MINOR_VERSION}::${MAJOR_VERSION}::${CURRENT_VERSION}::${PR_LINK}',
    }))).toBe('0::21031067::master::master::master::https://github.com/owner/repo/tree/master::v1.2.4::v1.3.0::v2.0.0::v1.2.3::[test title](http://example.com)');
  });

  it('should throw error', async() => {
    await expect(getPrTitle(octokit, generateActionContext({}))).rejects.toThrow();
  });

  it('should throw error', async() => {
    await expect(getPrTitle(octokit, generateActionContext({}, {}, {
      prTitle: '${PR_NUMBER}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_BASE_REF}::${PATCH_VERSION}::${MINOR_VERSION}::${MAJOR_VERSION}::${CURRENT_VERSION}::${PR_LINK}',
    }))).rejects.toThrow();
  });
});

describe('getPrLink', () => {
  it('should get pr link', () => {
    expect(getPrLink(generateActionContext({
      ref: 'refs/heads/test',
      event: 'push',
    }, {
      payload: {
        'pull_request': {
          title: 'test title',
          'html_url': 'http://example.com',
        },
      },
    }))).toBe('[test title](http://example.com)');
  });

  it('should get empty', () => {
    expect(getPrLink(generateActionContext({}))).toEqual('');
  });
});

describe('getPrBody', () => {
  testEnv();

  it('should get PR Body 1', async() => {
    const prBody = `
      ## Base PullRequest

      \${PR_TITLE} (\${PR_NUMBER_REF})

      ## Command results
      <details>
        <summary>Details: </summary>

        \${COMMANDS_OUTPUT}

      </details>

      ## Changed files
      <details>
        <summary>\${FILES_SUMMARY}: </summary>

        \${FILES}

      </details>

      <hr>

      [:octocat: Repo](\${ACTION_URL}) | [:memo: Issues](\${ACTION_URL}/issues) | [:department_store: Marketplace](\${ACTION_MARKETPLACE_URL})
`;

    expect(await getPrBody(false, ['README.md', 'CHANGELOG.md'], [
      {command: 'test1', stdout: ['test1-1', 'test1-2'], stderr: []},
      {command: 'test2', stdout: ['test2-1', 'test2-2'], stderr: ['test2-3']},
    ], octokit, generateActionContext({
      owner: actionDetails.actionOwner,
      repo: actionDetails.actionRepo,
    }, {
      payload: prPayload,
    }, {
      prBody,
    }))).toBe([
      '## Base PullRequest',
      '',
      'test title (#11)',
      '',
      '## Command results',
      '<details>',
      '<summary>Details: </summary>',
      '',
      '<details>',
      '<summary><em>test1</em></summary>',
      '',
      '```Shell',
      'test1-1',
      'test1-2',
      '```',
      '',
      '',
      '',
      '</details>',
      '<details>',
      '<summary><em>test2</em></summary>',
      '',
      '```Shell',
      'test2-1',
      'test2-2',
      '```',
      '',
      '### stderr:',
      '',
      '```Shell',
      'test2-3',
      '```',
      '',
      '</details>',
      '',
      '</details>',
      '',
      '## Changed files',
      '<details>',
      '<summary>Changed 2 files: </summary>',
      '',
      '- README.md',
      '- CHANGELOG.md',
      '',
      '</details>',
      '',
      '<hr>',
      '',
      '[:octocat: Repo](https://github.com/octocat/hello-world) | [:memo: Issues](https://github.com/octocat/hello-world/issues) | [:department_store: Marketplace](https://github.com/marketplace/actions/hello-world)',
    ].join('\n'));
  });

  it('should get PR Body 2', async() => {


    const prBody = `
      ## Base PullRequest

      \${PR_TITLE} (\${PR_NUMBER_REF})

      ## Command results
      <details>
        <summary>Details: </summary>

        \${COMMANDS_OUTPUT}

      </details>

      ## Changed files
      <details>
        <summary>\${FILES_SUMMARY}: </summary>

        \${FILES}

      </details>

      <hr>

      [:octocat: Repo](\${ACTION_URL}) | [:memo: Issues](\${ACTION_URL}/issues) | [:department_store: Marketplace](\${ACTION_MARKETPLACE_URL})
`;

    expect(await getPrBody(true, ['README.md', 'CHANGELOG.md'], [
      {command: 'test1', stdout: ['test1-1', 'test1-2'], stderr: []},
      {command: 'test2', stdout: ['test2-1', 'test2-2'], stderr: ['test2-3']},
    ], octokit, generateActionContext({
      owner: actionDetails.actionOwner,
      repo: actionDetails.actionRepo,
    }, {
      payload: prPayload,
    }, {
      prBody,
    }, undefined, undefined, true))).toBe([
      '## Base PullRequest',
      '',
      'default branch (https://github.com/octocat/hello-world/tree/master)',
      '',
      '## Command results',
      '<details>',
      '<summary>Details: </summary>',
      '',
      '<details>',
      '<summary><em>test1</em></summary>',
      '',
      '```Shell',
      'test1-1',
      'test1-2',
      '```',
      '',
      '',
      '',
      '</details>',
      '<details>',
      '<summary><em>test2</em></summary>',
      '',
      '```Shell',
      'test2-1',
      'test2-2',
      '```',
      '',
      '### stderr:',
      '',
      '```Shell',
      'test2-3',
      '```',
      '',
      '</details>',
      '',
      '</details>',
      '',
      '## Changed files',
      '<details>',
      '<summary>Changed 2 files: </summary>',
      '',
      '- README.md',
      '- CHANGELOG.md',
      '',
      '</details>',
      '',
      '<hr>',
      '',
      '[:octocat: Repo](https://github.com/octocat/hello-world) | [:memo: Issues](https://github.com/octocat/hello-world/issues) | [:department_store: Marketplace](https://github.com/marketplace/actions/hello-world)',
    ].join('\n'));
  });

  it('should get PR Body 3', async() => {
    const prBody = `
		\${COMMANDS}
		---------------------------
		\${COMMANDS_OUTPUT}
		---------------------------
		\${COMMANDS_STDOUT}
		---------------------------
		\${COMMANDS_STDOUT_OPENED}
		---------------------------
		\${COMMANDS_STDERR}
		---------------------------
		\${COMMANDS_STDERR_OPENED}
		---------------------------
		\${FILES}
		---------------------------
		\${FILES_SUMMARY}
		---------------------------
		\${ACTION_NAME}
		---------------------------
		\${ACTION_OWNER}
		---------------------------
		\${ACTION_REPO}
		---------------------------
		\${ACTION_URL}
		---------------------------
		\${ACTION_MARKETPLACE_URL}
		---------------------------
		\${DATE1}
		---------------------------
		\${DATE2}
		---------------------------
		\${VARIABLE1}
		---------------------------
		\${VARIABLE2}
`;

    expect(await getPrBody(false, ['README.md'], [
      {command: 'test1', stdout: ['test1-1', 'test1-2'], stderr: ['test1-3', 'test1-4']},
      {command: 'test2', stdout: [], stderr: []},
    ], octokit, generateActionContext({}, {
      payload: prPayload,
    }, {
      prBody,
      prVariables: ['variable1', ''],
      prDateFormats: ['YYYY/MM/DD', 'DD/MM/YYYY'],
    }))).toBe([
      '',
      '```Shell',
      '$ test1',
      '$ test2',
      '```',
      '',
      '---------------------------',
      '<details>',
      '<summary><em>test1</em></summary>',
      '',
      '```Shell',
      'test1-1',
      'test1-2',
      '```',
      '',
      '### stderr:',
      '',
      '```Shell',
      'test1-3',
      'test1-4',
      '```',
      '',
      '</details>',
      '<details>',
      '<summary><em>test2</em></summary>',
      '',
      '',
      '',
      '</details>',
      '---------------------------',
      '<details>',
      '<summary><em>test1</em></summary>',
      '',
      '```Shell',
      'test1-1',
      'test1-2',
      '```',
      '',
      '</details>',
      '<details>',
      '<summary><em>test2</em></summary>',
      '',
      '</details>',
      '---------------------------',
      '<details open>',
      '<summary><em>test1</em></summary>',
      '',
      '```Shell',
      'test1-1',
      'test1-2',
      '```',
      '',
      '</details>',
      '<details open>',
      '<summary><em>test2</em></summary>',
      '',
      '</details>',
      '---------------------------',
      '<details>',
      '<summary><em>test1</em></summary>',
      '',
      '```Shell',
      'test1-3',
      'test1-4',
      '```',
      '',
      '</details>',
      '<details>',
      '<summary><em>test2</em></summary>',
      '',
      '</details>',
      '---------------------------',
      '<details open>',
      '<summary><em>test1</em></summary>',
      '',
      '```Shell',
      'test1-3',
      'test1-4',
      '```',
      '',
      '</details>',
      '<details open>',
      '<summary><em>test2</em></summary>',
      '',
      '</details>',
      '---------------------------',
      '- README.md',
      '---------------------------',
      'Changed file',
      '---------------------------',
      'Test Action',
      '---------------------------',
      'octocat',
      '---------------------------',
      'hello-world',
      '---------------------------',
      'https://github.com/octocat/hello-world',
      '---------------------------',
      'https://github.com/marketplace/actions/hello-world',
      '---------------------------',
      moment().format('YYYY/MM/DD'),
      '---------------------------',
      moment().format('DD/MM/YYYY'),
      '---------------------------',
      'variable1',
      '---------------------------',
      '',
    ].join('\n'));
  });

  it('should get PR Body for default branch 1', async() => {
    const prBody                 = '${ACTION_OWNER}';
    const prBodyForDefaultBranch = '${ACTION_REPO}';

    expect(await getPrBody(false, [], [], octokit, generateActionContext({
      owner: 'owner',
      repo: 'repo',
      event: 'pull_request',
      ref: 'refs/heads/master',
    }, {
      payload: {
        'pull_request': {
          number: 0,
          id: 21031067,
          head: {
            ref: 'master',
          },
          base: {
            ref: 'master',
          },
          title: 'test title',
          'html_url': 'http://example.com',
        },
      },
    }, {
      prBody,
      prBodyForDefaultBranch,
    }))).toBe([
      'hello-world',
    ].join('\n'));
  });

  it('should get PR Body for default branch 2', async() => {
    const prBody = '${ACTION_OWNER}';

    expect(await getPrBody(false, [], [], octokit, generateActionContext({
      owner: 'owner',
      repo: 'repo',
      event: 'pull_request',
      ref: 'refs/heads/master',
    }, {
      payload: {
        'pull_request': {
          number: 0,
          id: 21031067,
          head: {
            ref: 'master',
          },
          base: {
            ref: 'master',
          },
          title: 'test title',
          'html_url': 'http://example.com',
        },
      },
    }, {
      prBody,
    }))).toBe([
      'octocat',
    ].join('\n'));
  });

  it('should get PR Body with empty output', async() => {
    const prBody = `
		\${COMMANDS}
		---------------------------
		\${COMMANDS_OUTPUT}
		---------------------------
		\${COMMANDS_STDOUT}
		---------------------------
		\${COMMANDS_STDOUT_OPENED}
		---------------------------
		\${COMMANDS_STDERR}
		---------------------------
		\${COMMANDS_STDERR_OPENED}
		---------------------------
		\${FILES}
		---------------------------
		\${FILES_SUMMARY}
		---------------------------
		\${ACTION_NAME}
		---------------------------
		\${ACTION_OWNER}
		---------------------------
		\${ACTION_REPO}
		---------------------------
		\${ACTION_URL}
		---------------------------
		\${ACTION_MARKETPLACE_URL}
		---------------------------
		\${DATE1}
		---------------------------
		\${DATE2}
		---------------------------
		\${VARIABLE1}
		---------------------------
		\${VARIABLE2}
`;

    expect(await getPrBody(false, [], [], octokit, generateActionContext({}, {
      payload: prPayload,
    }, {
      prBody,
      prVariables: ['variable1', ''],
      prDateFormats: ['YYYY/MM/DD', 'DD/MM/YYYY'],
    }))).toBe([
      '',
      '---------------------------',
      '',
      '---------------------------',
      '',
      '---------------------------',
      '',
      '---------------------------',
      '',
      '---------------------------',
      '',
      '---------------------------',
      '',
      '---------------------------',
      'Changed file',
      '---------------------------',
      'Test Action',
      '---------------------------',
      'octocat',
      '---------------------------',
      'hello-world',
      '---------------------------',
      'https://github.com/octocat/hello-world',
      '---------------------------',
      'https://github.com/marketplace/actions/hello-world',
      '---------------------------',
      moment().format('YYYY/MM/DD'),
      '---------------------------',
      moment().format('DD/MM/YYYY'),
      '---------------------------',
      'variable1',
      '---------------------------',
      '',
    ].join('\n'));
  });

  it('should not be code', async() => {
    expect(await getPrBody(false, [], [], octokit, generateActionContext({}, {
      payload: prPayload,
    }, {
      prBody: '${COMMANDS}',
    }))).toBe('');
  });

  it('should get body for comment (default branch)', async() => {
    expect(await getPrBody(true, [], [], octokit, generateActionContext({
      owner: actionDetails.actionOwner,
      repo: actionDetails.actionRepo,
    }, {
      payload: prPayload,
    }, {
      prBody: '${PR_TITLE}',
    }, undefined, undefined, true))).toBe('default branch');
  });

  it('should get body for comment (not default branch)', async() => {
    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/hello-world/pulls?head=' + encodeURIComponent('octocat:feature/new-feature'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'));

    expect(await getPrBody(true, [], [], octokit, generateActionContext({
      owner: actionDetails.actionOwner,
      repo: actionDetails.actionRepo,
    }, {
      payload: prPayload,
    }, {
      prBody: '${PR_TITLE}',
    }, 'develop'))).toBe('Amazing new feature');
  });

  it('should throw error 1', async() => {
    await expect(getPrBody(false, [], [], octokit, generateActionContext({}))).rejects.toThrow();
  });

  it('should throw error 2', async() => {
    await expect(getPrBody(true, [], [], octokit, generateActionContext({}, {
      payload: prPayload,
    }, {
      prBody: '${PR_TITLE}',
    }, 'develop', {
      [getCacheKey('pr', {branchName: 'master'})]: null,
    }))).rejects.toThrow();
  });
});
