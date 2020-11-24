/* eslint-disable no-magic-numbers */
import {Context} from '@actions/github/lib/context';
import moment from 'moment';
import nock from 'nock';
import {resolve} from 'path';
import {Logger} from '@technote-space/github-action-log-helper';
import {
  generateContext,
  testEnv,
  testFs,
  disableNetConnect,
  spyOnStdout,
  stdoutCalledWith,
  getApiFixture,
  setChildProcessParams,
  testChildProcess,
  getOctokit,
} from '@technote-space/github-action-test-helper';
import {ActionContext, ActionDetails} from '../../src/types';
import {execute, autoMerge} from '../../src/utils/process';
import {getCacheKey} from '../../src/utils/misc';

const workDir   = resolve(__dirname, 'test');
const rootDir   = resolve(__dirname, '..', 'fixtures');
const setExists = testFs();
beforeEach(() => {
  Logger.resetForTesting();
});

const actionDetails: ActionDetails = {
  actionName: 'Test Action',
  actionOwner: 'octocat',
  actionRepo: 'Hello-World',
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getActionContext             = (context: Context, _actionDetails?: { [key: string]: any }, branch?: string, isBatchProcess?: boolean): ActionContext => ({
  actionContext: context,
  actionDetail: _actionDetails ? Object.assign({}, actionDetails, _actionDetails) : actionDetails,
  cache: {
    [getCacheKey('repos', {owner: context.repo.owner, repo: context.repo.repo})]: branch ?? 'master',
  },
  isBatchProcess,
});

const context = (action: string, event = 'pull_request', ref = 'refs/pull/55/merge'): Context => generateContext({
  owner: 'octocat',
  repo: 'Hello-World',
  event,
  action,
  ref,
  sha: '7638417db6d59f3c431d3e1f261cc637155684cd',
}, {
  actor: 'test-actor',
  payload: 'push' === event ? {} : {
    number: 11,
    'pull_request': {
      number: 11,
      id: 21031067,
      head: {
        ref: 'feature/new-feature',
      },
      base: {
        ref: 'master',
      },
    },
  },
});
const octokit = getOctokit();

describe('execute', () => {
  disableNetConnect(nock);
  testEnv();
  testChildProcess();

  it('should close pull request (closed action)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.includes(' rev-parse')) {
          return 'change/new-topic1';
        }
        return '';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc&head=' + encodeURIComponent('octocat:master'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World')
      .reply(200, () => getApiFixture(rootDir, 'repos.get'))
      .post('/repos/octocat/Hello-World/issues/1347/comments')
      .reply(201)
      .patch('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.update'))
      .delete('/repos/octocat/Hello-World/git/refs/' + encodeURIComponent('heads/change/new-topic1'))
      .reply(204);

    await expect(execute(octokit, getActionContext(context('closed'), {
      prBranchName: 'test-${PR_ID}',
      prCloseMessage: 'close message',
      checkDefaultBranch: false,
      prBranchPrefix: 'change/',
    }))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '[command]git reset --hard',
      '> Switching branch to [change/new-topic1]...',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> change/new-topic1',
      '[command]git merge --no-edit origin/change/new-topic1',
      '[command]ls -la',
      '> Merging [origin/master] branch...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
      '[command]git config \'user.name\' test-actor',
      '[command]git config \'user.email\' \'test-actor@users.noreply.github.com\'',
      '[command]git merge --no-edit origin/master',
      '> Running commands...',
      '> Checking diff...',
      '[command]git add --all',
      '[command]git status --short -uno',
      '> There is no diff.',
      '> Checking references diff...',
      '[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
      '[command]git diff \'HEAD..origin/master\' --name-only',
      '> Closing PullRequest... [change/new-topic1]',
      '> Deleting reference... [refs/heads/change/new-topic1]',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
      '> \x1b[32;40m✔\x1b[0m\t[change/new-topic1] has been closed because there is no reference diff',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should close pull request (no ref diff)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.GITHUB_REPOSITORY  = 'octocat/Hello-World';
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.endsWith('status --short -uno')) {
          return 'M  __tests__/fixtures/test.md';
        }
        if (command.includes(' rev-parse')) {
          return 'test';
        }
        return '';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-21031067'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls/11')
      .reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
      .patch('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.update'))
      .delete('/repos/octocat/Hello-World/git/refs/' + encodeURIComponent('heads/Hello-World/test-21031067'))
      .reply(204);

    await execute(octokit, getActionContext(context('synchronize'), {
      executeCommands: ['yarn upgrade'],
      commitName: 'GitHub Actions',
      commitEmail: 'example@example.com',
      commitMessage: 'test: create pull request',
      prBranchName: 'test-${PR_ID}',
      prTitle: 'test: create pull request (${PR_NUMBER})',
      prBody: 'pull request body',
    }));

    stdoutCalledWith(mockStdout, [
      '::group::Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/Hello-World/test-21031067:refs/remotes/origin/Hello-World/test-21031067\'',
      '[command]git reset --hard',
      '::endgroup::',
      '::group::Switching branch to [Hello-World/test-21031067]...',
      '[command]git checkout -b Hello-World/test-21031067 origin/Hello-World/test-21031067',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test',
      '[command]git checkout Hello-World/test-21031067',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test',
      '> remote branch [Hello-World/test-21031067] not found.',
      '> now branch: test',
      '::endgroup::',
      '::group::Cloning [feature/new-feature] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
      '[command]git checkout -b feature/new-feature origin/feature/new-feature',
      '[command]git checkout -b Hello-World/test-21031067',
      '[command]ls -la',
      '::endgroup::',
      '::group::Running commands...',
      '[command]yarn upgrade',
      '::endgroup::',
      '::group::Checking diff...',
      '[command]git add --all',
      '[command]git status --short -uno',
      '[command]git config \'user.name\' \'GitHub Actions\'',
      '[command]git config \'user.email\' \'example@example.com\'',
      '::endgroup::',
      '::group::Committing...',
      '[command]git commit -qm \'test: create pull request\'',
      '[command]git show \'--stat-count=10\' HEAD',
      '::endgroup::',
      '::group::Checking references diff...',
      '[command]git fetch --prune --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
      '[command]git diff \'HEAD..origin/feature/new-feature\' --name-only',
      '::endgroup::',
      '::group::Closing PullRequest... [Hello-World/test-21031067]',
      '::endgroup::',
      '::group::Deleting reference... [refs/heads/Hello-World/test-21031067]',
      '::endgroup::',
      '::set-output name=result::succeeded',
      '> \x1b[32;40m✔\x1b[0m\t[feature/new-feature] has been closed because there is no reference diff',
    ]);
  });

  it('should close pull request (no diff, no ref diff)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.GITHUB_REPOSITORY  = 'octocat/Hello-World';
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.includes(' diff ')) {
          return '';
        }
        return 'stdout';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-21031067'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls/11')
      .reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
      .patch('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.update'))
      .delete('/repos/octocat/Hello-World/git/refs/' + encodeURIComponent('heads/Hello-World/test-21031067'))
      .reply(204);

    await execute(octokit, getActionContext(context('synchronize'), {
      executeCommands: ['yarn upgrade'],
      commitName: 'GitHub Actions',
      commitEmail: 'example@example.com',
      prBranchName: 'test-${PR_ID}',
    }));

    stdoutCalledWith(mockStdout, [
      '::group::Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/Hello-World/test-21031067:refs/remotes/origin/Hello-World/test-21031067\'',
      '  >> stdout',
      '[command]git reset --hard',
      '  >> stdout',
      '::endgroup::',
      '::group::Switching branch to [Hello-World/test-21031067]...',
      '[command]git checkout -b Hello-World/test-21031067 origin/Hello-World/test-21031067',
      '  >> stdout',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> stdout',
      '[command]git checkout Hello-World/test-21031067',
      '  >> stdout',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> stdout',
      '> remote branch [Hello-World/test-21031067] not found.',
      '> now branch: stdout',
      '::endgroup::',
      '::group::Cloning [feature/new-feature] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
      '  >> stdout',
      '[command]git checkout -b feature/new-feature origin/feature/new-feature',
      '  >> stdout',
      '[command]git checkout -b Hello-World/test-21031067',
      '  >> stdout',
      '[command]ls -la',
      '  >> stdout',
      '::endgroup::',
      '::group::Running commands...',
      '[command]yarn upgrade',
      '  >> stdout',
      '::endgroup::',
      '::group::Checking diff...',
      '[command]git add --all',
      '  >> stdout',
      '[command]git status --short -uno',
      '> There is no diff.',
      '::endgroup::',
      '::group::Checking references diff...',
      '[command]git fetch --prune --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
      '[command]git diff \'HEAD..origin/feature/new-feature\' --name-only',
      '::endgroup::',
      '::group::Closing PullRequest... [Hello-World/test-21031067]',
      '::endgroup::',
      '::group::Deleting reference... [refs/heads/Hello-World/test-21031067]',
      '::endgroup::',
      '::set-output name=result::succeeded',
      '> \x1b[32;40m✔\x1b[0m\t[feature/new-feature] has been closed because there is no reference diff',
    ]);
  });

  it('should close pull request (base pull request has been closed)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World')
      .reply(200, () => getApiFixture(rootDir, 'repos.get.dev'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:master'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.close'))
      .patch('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.update'))
      .delete('/repos/octocat/Hello-World/git/refs/' + encodeURIComponent('heads/change/new-topic1'))
      .reply(204);

    await expect(execute(octokit, getActionContext(context('', 'schedule'), {
      prBranchPrefix: 'change/',
      prBranchName: 'test-${PR_ID}',
      checkDefaultBranch: false,
    }, 'develop'))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Closing PullRequest... [change/new-topic1]',
      '> Deleting reference... [refs/heads/change/new-topic1]',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
      '> \x1b[32;40m✔\x1b[0m\t[change/new-topic1] has been closed because base PullRequest has been closed',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should close pull request (no ref diff, is action pr)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.endsWith('status --short -uno')) {
          return 'M  __tests__/fixtures/test.md';
        }
        if (command.includes(' rev-parse')) {
          return 'change/new-topic1';
        }
        return '';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc&head=' + encodeURIComponent('octocat:master'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World')
      .reply(200, () => getApiFixture(rootDir, 'repos.get'))
      .post('/repos/octocat/Hello-World/issues/1347/comments')
      .reply(201)
      .patch('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.update'))
      .delete('/repos/octocat/Hello-World/git/refs/' + encodeURIComponent('heads/change/new-topic1'))
      .reply(204);

    await expect(execute(octokit, getActionContext(context('closed'), {
      commitName: 'GitHub Actions',
      commitEmail: 'example@example.com',
      commitMessage: 'test: create pull request',
      prBranchName: 'test-${PR_ID}',
      prTitle: 'test: create pull request (${PR_NUMBER})',
      prBody: 'pull request body',
      prCloseMessage: 'close message',
      checkDefaultBranch: false,
      prBranchPrefix: 'change/',
    }))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '[command]git reset --hard',
      '> Switching branch to [change/new-topic1]...',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> change/new-topic1',
      '[command]git merge --no-edit origin/change/new-topic1',
      '[command]ls -la',
      '> Merging [origin/master] branch...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
      '[command]git config \'user.name\' \'GitHub Actions\'',
      '[command]git config \'user.email\' \'example@example.com\'',
      '[command]git merge --no-edit origin/master',
      '> Running commands...',
      '> Checking diff...',
      '[command]git add --all',
      '[command]git status --short -uno',
      '[command]git config \'user.name\' \'GitHub Actions\'',
      '[command]git config \'user.email\' \'example@example.com\'',
      '> Committing...',
      '[command]git commit -qm \'test: create pull request\'',
      '[command]git show \'--stat-count=10\' HEAD',
      '> Checking references diff...',
      '[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
      '[command]git diff \'HEAD..origin/master\' --name-only',
      '> Closing PullRequest... [change/new-topic1]',
      '> Deleting reference... [refs/heads/change/new-topic1]',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
      '> \x1b[32;40m✔\x1b[0m\t[change/new-topic1] has been closed because there is no reference diff',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should do nothing (action base pull request not found)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World')
      .reply(200, () => getApiFixture(rootDir, 'repos.get.dev'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:master'))
      .reply(200, () => [])
      .patch('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.update'))
      .delete('/repos/octocat/Hello-World/git/refs/' + encodeURIComponent('heads/change/new-topic1'))
      .reply(204);

    await expect(execute(octokit, getActionContext(context('', 'schedule'), {
      prBranchPrefix: 'change/',
      prBranchName: 'test-${PR_ID}',
      checkDefaultBranch: false,
    }, 'develop'))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Closing PullRequest... [change/new-topic1]',
      '> Deleting reference... [refs/heads/change/new-topic1]',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
      '> \x1b[32;40m✔\x1b[0m\t[change/new-topic1] has been closed because base PullRequest does not exist',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should do nothing (action pull request not found)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
      .reply(200, () => []);

    await expect(execute(octokit, getActionContext(context('', 'schedule'), {
      prBranchPrefix: 'change/',
      prBranchName: 'test-${PR_ID}',
      checkDefaultBranch: false,
    }))).rejects.toThrow('There are failed processes.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:0  Failed:2  Skipped:0',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic1] not found',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should do nothing (not target branch)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list2'))
      .get('/repos/octocat/Hello-World')
      .reply(200, () => getApiFixture(rootDir, 'repos.get'));

    await expect(execute(octokit, getActionContext(context('', 'schedule'), {
      targetBranchPrefix: 'test/',
    }))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [feature/new-topic3]',
      '::endgroup::',
      '::group::Target PullRequest Ref [feature/new-topic4]',
      '::endgroup::',
      '::group::Target PullRequest Ref [master]',
      '::endgroup::',
      '::group::Total:3  Succeeded:0  Failed:1  Skipped:2',
      '> \x1b[33;40m→\x1b[0m\t[feature/new-topic3] This is not target branch',
      '> \x1b[33;40m→\x1b[0m\t[feature/new-topic4] This is not target branch',
      '> \x1b[31;40m×\x1b[0m\t[master] parameter [prBranchName] is required.',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should do nothing (PR from fork)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list3'))
      .get('/repos/octocat/Hello-World')
      .reply(200, () => getApiFixture(rootDir, 'repos.get'));

    await expect(execute(octokit, getActionContext(context('', 'schedule'), {}))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [master]',
      '::endgroup::',
      '::group::Total:3  Succeeded:0  Failed:1  Skipped:2',
      '> \x1b[33;40m→\x1b[0m\t[fork1:feature/new-topic3] PR from fork',
      '> \x1b[33;40m→\x1b[0m\t[fork2:feature/new-topic4] PR from fork',
      '> \x1b[31;40m×\x1b[0m\t[master] parameter [prBranchName] is required.',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should do nothing (no diff)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.includes(' diff ')) {
          return '';
        }
        return 'stdout';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-21031067'))
      .reply(200, () => []);

    await execute(octokit, getActionContext(context('synchronize'), {
      executeCommands: ['yarn upgrade'],
      commitName: 'GitHub Actions',
      commitEmail: 'example@example.com',
      prBranchName: 'test-${PR_ID}',
    }));

    stdoutCalledWith(mockStdout, [
      '::group::Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/Hello-World/test-21031067:refs/remotes/origin/Hello-World/test-21031067\'',
      '  >> stdout',
      '[command]git reset --hard',
      '  >> stdout',
      '::endgroup::',
      '::group::Switching branch to [Hello-World/test-21031067]...',
      '[command]git checkout -b Hello-World/test-21031067 origin/Hello-World/test-21031067',
      '  >> stdout',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> stdout',
      '[command]git checkout Hello-World/test-21031067',
      '  >> stdout',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> stdout',
      '> remote branch [Hello-World/test-21031067] not found.',
      '> now branch: stdout',
      '::endgroup::',
      '::group::Cloning [feature/new-feature] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
      '  >> stdout',
      '[command]git checkout -b feature/new-feature origin/feature/new-feature',
      '  >> stdout',
      '[command]git checkout -b Hello-World/test-21031067',
      '  >> stdout',
      '[command]ls -la',
      '  >> stdout',
      '::endgroup::',
      '::group::Running commands...',
      '[command]yarn upgrade',
      '  >> stdout',
      '::endgroup::',
      '::group::Checking diff...',
      '[command]git add --all',
      '  >> stdout',
      '[command]git status --short -uno',
      '> There is no diff.',
      '::endgroup::',
      '::group::Checking references diff...',
      '[command]git fetch --prune --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
      '[command]git diff \'HEAD..origin/feature/new-feature\' --name-only',
      '::set-output name=result::not changed',
      '::endgroup::',
      '> \x1b[33;40m✔\x1b[0m\t[feature/new-feature] There is no diff',
    ]);
  });

  it('should do nothing (no diff (push)))', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.includes(' rev-parse')) {
          return 'test/change';
        }
        return '';
      },
    });
    setExists(true);

    await execute(octokit, getActionContext(context('', 'push', 'refs/heads/test/change'), {
      targetBranchPrefix: 'test/',
      executeCommands: ['yarn upgrade'],
    }));

    stdoutCalledWith(mockStdout, [
      '::group::Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/test/change:refs/remotes/origin/test/change\'',
      '[command]git reset --hard',
      '::endgroup::',
      '::group::Switching branch to [test/change]...',
      '[command]git checkout -b test/change origin/test/change',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test/change',
      '[command]git merge --no-edit origin/test/change',
      '[command]ls -la',
      '::endgroup::',
      '::group::Running commands...',
      '[command]yarn upgrade',
      '::endgroup::',
      '::group::Checking diff...',
      '[command]git add --all',
      '[command]git status --short -uno',
      '> There is no diff.',
      '::set-output name=result::not changed',
      '::endgroup::',
      '> \x1b[33;40m✔\x1b[0m\t[test/change] There is no diff',
    ]);
  });
});

describe('autoMerge', () => {
  disableNetConnect(nock);
  testEnv();
  testChildProcess();

  it('should return false 1', async() => {
    expect(await autoMerge({
      'created_at': '',
      number: 1347,
    }, new Logger(), octokit, getActionContext(context('synchronize')))).toBe(false);
  });

  it('should return false 2', async() => {
    expect(await autoMerge({
      'created_at': moment().subtract(10, 'days').toISOString(),
      number: 1347,
    }, new Logger(), octokit, getActionContext(context('synchronize'), {
      autoMergeThresholdDays: '10',
    }))).toBe(false);
  });

  it('should return false 3', async() => {
    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.false'));

    expect(await autoMerge({
      'created_at': moment().subtract(11, 'days').toISOString(),
      number: 1347,
    }, new Logger(), octokit, getActionContext(context('synchronize'), {
      autoMergeThresholdDays: '10',
    }))).toBe(false);
  });

  it('should return false 4', async() => {
    process.env.GITHUB_RUN_ID = '123';

    const mockStdout = spyOnStdout();
    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
      .put('/repos/octocat/Hello-World/pulls/1347/merge')
      .reply(405, {
        'message': 'Pull Request is not mergeable',
        'documentation_url': 'https://developer.github.com/v3/pulls/#merge-a-pull-request-merge-button',
      })
      .get('/repos/octocat/Hello-World/commits/7638417db6d59f3c431d3e1f261cc637155684cd/status')
      .reply(200, () => getApiFixture(rootDir, 'status.success'))
      .get('/repos/octocat/Hello-World/actions/runs/123')
      .reply(200, () => getApiFixture(rootDir, 'actions.workflow.run'))
      .get('/repos/octocat/Hello-World/commits/7638417db6d59f3c431d3e1f261cc637155684cd/check-suites')
      .reply(200, () => getApiFixture(rootDir, 'checks.success'));

    expect(await autoMerge({
      'created_at': moment().subtract(11, 'days').toISOString(),
      number: 1347,
    }, new Logger(), octokit, getActionContext(context('synchronize'), {
      autoMergeThresholdDays: '10',
    }))).toBe(false);

    stdoutCalledWith(mockStdout, [
      '::group::Checking auto merge...',
      '> All checks are passed.',
      '::endgroup::',
      '::group::Auto merging...',
      '::warning::Pull Request is not mergeable',
    ]);
  });

  it('should return false 5', async() => {
    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
      .put('/repos/octocat/Hello-World/pulls/1347/merge')
      .reply(200, {
        'sha': '6dcb09b5b57875f334f61aebed695e2e4193db5e',
        'merged': true,
        'message': 'Pull Request successfully merged',
      })
      .get('/repos/octocat/Hello-World/commits/7638417db6d59f3c431d3e1f261cc637155684cd/status')
      .reply(200, () => getApiFixture(rootDir, 'status.failed'));

    expect(await autoMerge({
      'created_at': moment().subtract(11, 'days').toISOString(),
      number: 1347,
    }, new Logger(), octokit, getActionContext(context('synchronize'), {
      autoMergeThresholdDays: '10',
    }))).toBe(false);
  });

  it('should return true', async() => {
    process.env.GITHUB_RUN_ID = '123';

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
      .put('/repos/octocat/Hello-World/pulls/1347/merge')
      .reply(200, {
        'sha': '6dcb09b5b57875f334f61aebed695e2e4193db5e',
        'merged': true,
        'message': 'Pull Request successfully merged',
      })
      .get('/repos/octocat/Hello-World/commits/7638417db6d59f3c431d3e1f261cc637155684cd/status')
      .reply(200, () => getApiFixture(rootDir, 'status.success'))
      .get('/repos/octocat/Hello-World/actions/runs/123')
      .reply(200, () => getApiFixture(rootDir, 'actions.workflow.run'))
      .get('/repos/octocat/Hello-World/commits/7638417db6d59f3c431d3e1f261cc637155684cd/check-suites')
      .reply(200, () => getApiFixture(rootDir, 'checks.success'));

    expect(await autoMerge({
      'created_at': moment().subtract(11, 'days').toISOString(),
      number: 1347,
    }, new Logger(), octokit, getActionContext(context('synchronize'), {
      autoMergeThresholdDays: '10',
    }))).toBe(true);
  });
});
