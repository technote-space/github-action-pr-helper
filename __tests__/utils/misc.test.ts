/* eslint-disable no-magic-numbers */
import {Context} from '@actions/github/lib/context';
import nock from 'nock';
import {resolve} from 'path';
import {Logger} from '@technote-space/github-action-helper';
import {testEnv, generateContext, testFs, getOctokit, disableNetConnect, getApiFixture} from '@technote-space/github-action-test-helper';
import {
  getActionDetail,
  replaceDirectory,
  getPrHeadRef,
  getPrBaseRef,
  isActionPr,
  isDisabledDeletePackage,
  isTargetContext,
  isClosePR,
  isTargetBranch,
  filterGitStatus,
  filterExtension,
  checkDefaultBranch,
  checkOnlyDefaultBranch,
  getCacheKey,
  ensureGetPulls,
  getPullsArgsForDefaultBranch,
  isActiveTriggerWorkflow,
  getTriggerWorkflowMessage,
  isPassedAllChecks,
} from '../../src/utils/misc';
import {ActionContext, ActionDetails} from '../../src/types';
import {DEFAULT_TRIGGER_WORKFLOW_MESSAGE} from '../../src/constant';

beforeEach(() => {
  Logger.resetForTesting();
});
testFs(true);

const octokit                      = getOctokit();
const actionDetails: ActionDetails = {
  actionName: 'Test Action',
  actionOwner: 'octocat',
  actionRepo: 'hello-world',
};
const getActionContext             = (context: Context, _actionDetails?: ActionDetails, defaultBranch?: string): ActionContext => ({
  actionContext: context,
  actionDetail: _actionDetails ?? actionDetails,
  cache: {
    [getCacheKey('repos', {owner: context.repo.owner, repo: context.repo.repo})]: defaultBranch ?? 'master',
  },
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
): ActionContext => getActionContext(
  generateContext(settings, override),
  _actionDetails ? Object.assign({}, actionDetails, _actionDetails) : undefined,
  defaultBranch,
);

describe('getActionDetail', () => {
  it('should get detail', () => {
    expect(getActionDetail('prVariables', generateActionContext({}, {}, {
      prVariables: [1, 2, 3],
    }))).toEqual([1, 2, 3]);
    expect(getActionDetail('prVariables', generateActionContext({}, {}, {}), () => [2, 3, 4])).toEqual([2, 3, 4]);
    expect(getActionDetail('prVariables', generateActionContext({}, {}, {
      prVariables: false,
    }))).toEqual(undefined);
  });

  it('should throw error', () => {
    expect(() => getActionDetail('prTitle', generateActionContext({}))).toThrow();
    expect(() => getActionDetail('prTitle', generateActionContext({}, {}, {
      prTitle: '',
    }))).toThrow();
  });
});

describe('isTargetContext', () => {
  testEnv();

  it('should return true 1', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'pull_request',
      action: 'opened',
    }, {
      payload: {
        'pull_request': {
          labels: [],
          head: {
            ref: 'change',
          },
        },
      },
    }))).toBe(true);
  });

  it('should return true 2', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'pull_request',
      action: 'synchronize',
    }, {
      payload: {
        'pull_request': {
          labels: [{name: 'label1'}, {name: 'label2'}],
          head: {
            ref: 'change',
          },
        },
      },
    }, {includeLabels: ['label2']}))).toBe(true);
  });

  it('should return true 3', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'pull_request',
      action: 'synchronize',
    }, {
      payload: {
        'pull_request': {
          labels: [{name: 'label2'}],
          head: {
            ref: 'change',
          },
        },
      },
    }, {includeLabels: ['label1', 'label2', 'label3']}))).toBe(true);
  });

  it('should return true 4', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'pull_request',
      action: 'opened',
    }, {
      payload: {
        'pull_request': {
          labels: [],
          head: {
            ref: 'change',
          },
        },
      },
    }))).toBe(true);
  });

  it('should return true 5', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'pull_request',
      action: 'closed',
    }, {
      payload: {
        'pull_request': {
          labels: [],
          head: {
            ref: 'change',
          },
        },
      },
    }))).toBe(true);
  });

  it('should return true 6', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'schedule',
    }))).toBe(true);
  });

  it('should return true 7', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'repository_dispatch',
    }))).toBe(true);
  });

  it('should return true 8', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'workflow_dispatch',
    }))).toBe(true);
  });

  it('should return true 9', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'workflow_run',
    }))).toBe(true);
  });

  it('should return true 10', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      ref: 'refs/heads/test/change',
      event: 'push',
    }, {}, {targetBranchPrefix: 'test/', targetEvents: {push: '*'}}))).toBe(true);
  });

  it('should return true 11', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'pull_request',
      action: 'synchronize',
    }, {
      payload: {
        'pull_request': {
          labels: [],
          head: {
            ref: 'target/change',
          },
        },
      },
    }, {
      targetBranchPrefix: 'target/',
    }))).toBe(true);
  });

  it('should return true 12', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'pull_request',
      action: 'synchronize',
    }, {
      payload: {
        'pull_request': {
          head: {
            ref: 'hello-world/change',
          },
        },
      },
    }))).toBe(true);
  });

  it('should return true 13', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'pull_request',
      action: 'synchronize',
    }, {
      payload: {
        'pull_request': {
          head: {
            ref: 'hello-world/change',
          },
        },
      },
    }, {
      targetBranchPrefix: 'target/',
    }))).toBe(true);
  });

  it('should return true 14', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'pull_request',
      action: 'closed',
    }))).toBe(true);
  });

  it('should return true 15', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'pull_request_target',
      action: 'closed',
    }))).toBe(true);
  });

  it('should return true 16', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'workflow_run',
    }))).toBe(true);
  });

  it('should return false 1', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      ref: 'tags/test',
      event: 'issues',
      action: 'opened',
    }))).toBe(false);
  });

  it('should return false 2', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      event: 'pull_request',
      action: 'opened',
    }, {
      payload: {
        'pull_request': {
          labels: [{name: 'label1'}],
          head: {
            ref: 'change',
          },
        },
      },
    }, {includeLabels: 'test2'}))).toBe(false);
  });

  it('should return false 3', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      ref: 'refs/heads/master',
      event: 'pull_request',
      action: 'synchronize',
    }, {
      payload: {
        'pull_request': {
          labels: [{name: 'label2'}],
          head: {
            ref: 'change',
          },
        },
      },
    }, {includeLabels: 'test1'}))).toBe(false);
  });

  it('should return false 4', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      ref: 'refs/heads/test/change',
      event: 'push',
    }))).toBe(false);
  });

  it('should return false 5', async() => {
    expect(await isTargetContext(octokit, generateActionContext({
      ref: 'refs/heads/change',
      event: 'pull_request',
      action: 'synchronize',
    }, undefined, {
      targetBranchPrefix: 'target/',
    }))).toBe(false);
  });
});

describe('replaceDirectory', () => {
  testEnv();

  it('should replace working directory 1', () => {
    process.env.GITHUB_WORKSPACE = resolve('test-dir');
    const workDir                = resolve('test-dir');

    expect(replaceDirectory(`git -C ${workDir} fetch`)).toBe('git fetch');
  });

  it('should replace working directory 2', () => {
    process.env.GITHUB_WORKSPACE = resolve('test-dir');
    const workDir                = resolve('test-dir');

    expect(replaceDirectory(`cp -a ${workDir}/test1 ${workDir}/test2`)).toBe('cp -a [Working Directory]/test1 [Working Directory]/test2');
  });
});

describe('getPrHeadRef', () => {
  it('should get pr head ref', () => {
    expect(getPrHeadRef(generateActionContext({}, {
      payload: {
        'pull_request': {
          head: {
            ref: 'change',
          },
        },
      },
    }))).toBe('change');
  });

  it('should return empty', () => {
    expect(getPrHeadRef(generateActionContext({}))).toBe('');
  });
});

describe('getPrBaseRef', () => {
  it('should get pr base ref', () => {
    expect(getPrBaseRef(generateActionContext({}, {
      payload: {
        'pull_request': {
          base: {
            ref: 'change',
          },
        },
      },
    }))).toBe('change');
  });

  it('should return empty', () => {
    expect(getPrBaseRef(generateActionContext({}))).toBe('');
  });
});

describe('isActionPr', () => {
  testEnv();

  it('should return true', () => {
    expect(isActionPr(generateActionContext({}, {
      payload: {
        'pull_request': {
          head: {
            ref: 'prefix/test',
          },
        },
      },
    }, {prBranchPrefix: 'prefix/'}))).toBe(true);
  });

  it('should return false 1', () => {
    expect(isActionPr(generateActionContext({}, {
      payload: {
        'pull_request': {
          head: {
            ref: 'prefix/test',
          },
        },
      },
    }))).toBe(false);
  });

  it('should return false 2', () => {
    expect(isActionPr(generateActionContext({}, {
      payload: {},
    }))).toBe(false);
  });
});

describe('isDisabledDeletePackage', () => {
  testEnv();

  it('should be false', () => {
    expect(isDisabledDeletePackage(generateActionContext({}, {}, {
      deletePackage: true,
    }))).toBe(false);
  });

  it('should be true 1', () => {
    expect(isDisabledDeletePackage(generateActionContext({}, {}, {
      deletePackage: false,
    }))).toBe(true);
  });

  it('should be true 2', () => {
    expect(isDisabledDeletePackage(generateActionContext({}))).toBe(true);
  });
});

describe('isClosePR', () => {
  testEnv();
  it('should return true', () => {
    expect(isClosePR(generateActionContext({
      event: 'pull_request',
      action: 'closed',
    }))).toBe(true);
  });

  it('should return false 1', () => {
    expect(isClosePR(generateActionContext({
      event: 'push',
    }, {}, {
      prBranchName: 'test',
    }))).toBe(false);
  });

  it('should return false 2', () => {
    expect(isClosePR(generateActionContext({
      event: 'pull_request',
      action: 'synchronize',
    }))).toBe(false);
  });
});

describe('isTargetBranch', () => {
  testEnv();

  it('should return true 1', async() => {
    expect(await isTargetBranch('test', octokit, generateActionContext({}))).toBe(true);
  });

  it('should return true 2', async() => {
    expect(await isTargetBranch('feature/test', octokit, generateActionContext({}, {}, {
      targetBranchPrefix: 'feature/',
    }))).toBe(true);
  });

  it('should return false', async() => {
    expect(await isTargetBranch('test', octokit, generateActionContext({}, {}, {
      targetBranchPrefix: 'feature/',
    }))).toBe(false);
  });
});

describe('filterGitStatusFunc', () => {
  testEnv();

  it('should filter git status', () => {
    const context = generateActionContext({}, {}, {
      filterGitStatus: 'Mdc',
    });
    expect(filterGitStatus('M  test.md', context)).toBe(true);
    expect(filterGitStatus('D  test.md', context)).toBe(true);
    expect(filterGitStatus('A  test.md', context)).toBe(false);
    expect(filterGitStatus('C  test.md', context)).toBe(false);
  });

  it('should not filter', () => {
    const context = generateActionContext({});
    expect(filterGitStatus('M  test.md', context)).toBe(true);
    expect(filterGitStatus('D  test.md', context)).toBe(true);
    expect(filterGitStatus('A  test.md', context)).toBe(true);
    expect(filterGitStatus('C  test.md', context)).toBe(true);
  });

  it('should throw error', () => {
    expect(() => filterGitStatus('C  test.md', generateActionContext({}, {}, {
      filterGitStatus: 'c',
    }))).toThrow();
  });
});

describe('filterExtension', () => {
  testEnv();

  it('should filter extension', () => {
    const context = generateActionContext({}, {}, {
      filterExtensions: ['md', '.txt'],
    });
    expect(filterExtension('test.md', context)).toBe(true);
    expect(filterExtension('test.txt', context)).toBe(true);
    expect(filterExtension('test.js', context)).toBe(false);
    expect(filterExtension('test.1md', context)).toBe(false);
    expect(filterExtension('test.md1', context)).toBe(false);
  });

  it('should not filter', () => {
    const context = generateActionContext({});
    expect(filterExtension('test.md', context)).toBe(true);
    expect(filterExtension('test.txt', context)).toBe(true);
    expect(filterExtension('test.js', context)).toBe(true);
    expect(filterExtension('test.1md', context)).toBe(true);
    expect(filterExtension('test.md1', context)).toBe(true);
  });
});

describe('checkDefaultBranch', () => {
  testEnv();

  it('should return true if not set', () => {
    expect(checkDefaultBranch(generateActionContext({}))).toBe(true);
  });

  it('should return true', () => {
    expect(checkDefaultBranch(generateActionContext({}, {}, {
      checkDefaultBranch: true,
    }))).toBe(true);
  });

  it('should return false', () => {
    expect(checkDefaultBranch(generateActionContext({}, {}, {
      checkDefaultBranch: false,
    }))).toBe(false);
  });
});

describe('checkOnlyDefaultBranch', () => {
  testEnv();

  it('should return false if not set', () => {
    expect(checkOnlyDefaultBranch(generateActionContext({}))).toBe(false);
  });

  it('should return true', () => {
    expect(checkOnlyDefaultBranch(generateActionContext({}, {}, {
      checkOnlyDefaultBranch: true,
    }))).toBe(true);
  });

  it('should return false', () => {
    expect(checkOnlyDefaultBranch(generateActionContext({}, {}, {
      checkOnlyDefaultBranch: false,
    }))).toBe(false);
  });
});

describe('ensureGetPulls', () => {
  const context = generateActionContext({});

  it('should return pulls 1', async() => {
    const pulls = await ensureGetPulls(await getPullsArgsForDefaultBranch(octokit, context), octokit, context);
    expect(pulls).toHaveProperty('number');
    expect(pulls).toHaveProperty('id');
    expect(pulls).toHaveProperty('head');
    expect(pulls).toHaveProperty('base');
    expect(pulls).toHaveProperty('title');
    expect(pulls).toHaveProperty('html_url');
    expect(pulls.number).toBe(0);
    expect(pulls.id).toBe(0);
    expect(pulls.title).toBe('default branch');
  });

  it('should return pulls 2', async() => {
    const pulls = await ensureGetPulls(null, octokit, context);
    expect(pulls).toHaveProperty('number');
    expect(pulls).toHaveProperty('html_url');
  });
});

describe('isActiveTriggerWorkflow', () => {
  testEnv();

  it('should return true 1', () => {
    process.env.INPUT_API_TOKEN = 'test-token';
    expect(isActiveTriggerWorkflow(generateActionContext({}))).toBe(true);
  });

  it('should return true 2', () => {
    process.env.INPUT_API_TOKEN = 'test-token';
    expect(isActiveTriggerWorkflow(generateActionContext({}, undefined, {triggerWorkflowMessage: 'test'}))).toBe(true);
  });

  it('should return false 1', () => {
    expect(isActiveTriggerWorkflow(generateActionContext({}))).toBe(false);
  });

  it('should return false 2', () => {
    process.env.INPUT_API_TOKEN = 'test-token';
    expect(isActiveTriggerWorkflow(generateActionContext({}, undefined, {triggerWorkflowMessage: ''}))).toBe(false);
  });
});

describe('getTriggerWorkflowMessage', () => {
  it('should get message', () => {
    expect(getTriggerWorkflowMessage(generateActionContext({}, undefined, {triggerWorkflowMessage: 'test'}))).toBe('test');
  });

  it('should get default message', () => {
    expect(getTriggerWorkflowMessage(generateActionContext({}))).toBe(DEFAULT_TRIGGER_WORKFLOW_MESSAGE);
  });
});

describe('isPassedAllChecks', () => {
  disableNetConnect(nock);
  const rootDir = resolve(__dirname, '..', 'fixtures');

  it('should return false 1', async() => {
    nock('https://api.github.com')
      .persist()
      .get('/repos/hello/world/commits/test-sha/status')
      .reply(200, () => getApiFixture(rootDir, 'status.failed'));

    expect(await isPassedAllChecks(octokit, generateActionContext({
      owner: 'hello',
      repo: 'world',
      sha: 'test-sha',
    }))).toBe(false);
  });

  it('should return false 2', async() => {
    process.env.GITHUB_RUN_ID = '123';

    nock('https://api.github.com')
      .persist()
      .get('/repos/hello/world/commits/test-sha/status')
      .reply(200, () => getApiFixture(rootDir, 'status.success'))
      .get('/repos/hello/world/actions/runs/123')
      .reply(200, () => getApiFixture(rootDir, 'actions.workflow.run'))
      .get('/repos/hello/world/commits/test-sha/check-suites')
      .reply(200, () => getApiFixture(rootDir, 'checks.failed1'));

    expect(await isPassedAllChecks(octokit, generateActionContext({
      owner: 'hello',
      repo: 'world',
      sha: 'test-sha',
    }))).toBe(false);
  });

  it('should return false 3', async() => {
    process.env.GITHUB_RUN_ID = '123';

    nock('https://api.github.com')
      .persist()
      .get('/repos/hello/world/commits/test-sha/status')
      .reply(200, () => getApiFixture(rootDir, 'status.success'))
      .get('/repos/hello/world/actions/runs/123')
      .reply(200, () => getApiFixture(rootDir, 'actions.workflow.run'))
      .get('/repos/hello/world/commits/test-sha/check-suites')
      .reply(200, () => getApiFixture(rootDir, 'checks.failed2'));

    expect(await isPassedAllChecks(octokit, generateActionContext({
      owner: 'hello',
      repo: 'world',
      sha: 'test-sha',
    }))).toBe(false);
  });

  it('should return true', async() => {
    process.env.GITHUB_RUN_ID = '123';

    nock('https://api.github.com')
      .persist()
      .get('/repos/hello/world/commits/test-sha/status')
      .reply(200, () => getApiFixture(rootDir, 'status.success'))
      .get('/repos/hello/world/actions/runs/123')
      .reply(200, () => getApiFixture(rootDir, 'actions.workflow.run'))
      .get('/repos/hello/world/commits/test-sha/check-suites')
      .reply(200, () => getApiFixture(rootDir, 'checks.success'));

    expect(await isPassedAllChecks(octokit, generateActionContext({
      owner: 'hello',
      repo: 'world',
      sha: 'test-sha',
    }))).toBe(true);
  });
});
