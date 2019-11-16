# GitHub Action PR Helper

[![CI Status](https://github.com/technote-space/github-action-pr-helper/workflows/CI/badge.svg)](https://github.com/technote-space/github-action-pr-helper/actions)
[![codecov](https://codecov.io/gh/technote-space/github-action-pr-helper/branch/master/graph/badge.svg)](https://codecov.io/gh/technote-space/github-action-pr-helper)
[![CodeFactor](https://www.codefactor.io/repository/github/technote-space/github-action-pr-helper/badge)](https://www.codefactor.io/repository/github/technote-space/github-action-pr-helper)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/technote-space/github-action-pr-helper/blob/master/LICENSE)

*Read this in other languages: [English](README.md), [日本語](README.ja.md).*

PullRequest Helper for GitHub Actions.

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Screenshots](#screenshots)
- [Installation](#installation)
- [Options](#options)
- [Action event details](#action-event-details)
  - [Target events](#target-events)
  - [condition](#condition)
- [Addition](#addition)
- [Sample GitHub Actions using this Action](#sample-github-actions-using-this-action)
- [Author](#author)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Usage
1. Install  
`npm i @technote-space/github-action-pr-helper`
1. Use
```typescript
import { run } from '@technote-space/github-action-pr-helper';

run();
```

## Author
[GitHub (Technote)](https://github.com/technote-space)  
[Blog](https://technote.space)
