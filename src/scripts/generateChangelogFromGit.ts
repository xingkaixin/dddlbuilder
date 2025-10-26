import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

interface GitCommit {
  date: string
  hash: string
  message: string
}

interface VersionEntry {
  version: string
  date: string
  commits: GitCommit[]
}

function getGitCommits(): GitCommit[] {
  try {
    const gitLog = execSync('git log --oneline --date=short --pretty=format:"%ad %h %s" --date=format:"%Y-%m-%d"', { encoding: 'utf8' })
    const lines = gitLog.trim().split('\n')

    return lines.map(line => {
      const [date, hash, ...messageParts] = line.split(' ')
      return {
        date,
        hash,
        message: messageParts.join(' ')
      }
    })
  } catch (error) {
    console.error('Error reading git log:', error)
    return []
  }
}

function groupCommitsByVersion(commits: GitCommit[]): VersionEntry[] {
  const versionGroups: { [key: string]: GitCommit[] } = {}

  // Group commits by date
  commits.forEach(commit => {
    if (!versionGroups[commit.date]) {
      versionGroups[commit.date] = []
    }
    versionGroups[commit.date].push(commit)
  })

  // Convert to array and sort by date (newest first)
  const sortedDates = Object.keys(versionGroups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

  // Generate version numbers starting from 0.0.1
  const totalVersions = sortedDates.length
  const versions: VersionEntry[] = []

  sortedDates.forEach((date, index) => {
    // Calculate version: newest gets highest version number
    const versionIndex = totalVersions - index - 1
    let major = 0
    let minor = 0
    let patch = versionIndex + 1

    if (patch > 9) {
      minor = Math.floor(patch / 10)
      patch = patch % 10
    }

    if (minor > 9) {
      major = Math.floor(minor / 10)
      minor = minor % 10
    }

    const version = `${major}.${minor}.${patch}`

    versions.push({
      version,
      date,
      commits: versionGroups[date]
    })
  })

  return versions
}

function categorizeCommits(commits: GitCommit[]): { [category: string]: string[] } {
  const categories: { [category: string]: string[] } = {
    '新增 🎉': [],
    '修复 🐛': [],
    '优化 ⚡': [],
    '重构 🔧': [],
    '测试 🧪': [],
    '文档 📝': [],
    '其他 📦': []
  }

  commits.forEach(commit => {
    const message = commit.message

    // Categorize based on commit message prefix
    if (message.startsWith('feat:') || message.startsWith('新增')) {
      categories['新增 🎉'].push(`- ${message.replace(/^(feat:|新增)/, '').trim()}`)
    } else if (message.startsWith('fix:') || message.startsWith('修复')) {
      categories['修复 🐛'].push(`- ${message.replace(/^(fix:|修复)/, '').trim()}`)
    } else if (message.startsWith('refactor:') || message.startsWith('重构')) {
      categories['重构 🔧'].push(`- ${message.replace(/^(refactor:|重构)/, '').trim()}`)
    } else if (message.startsWith('test:') || message.startsWith('测试')) {
      categories['测试 🧪'].push(`- ${message.replace(/^(test:|测试)/, '').trim()}`)
    } else if (message.startsWith('docs:') || message.startsWith('文档')) {
      categories['文档 📝'].push(`- ${message.replace(/^(docs:|文档)/, '').trim()}`)
    } else if (message.startsWith('优化') || message.includes('优化') || message.includes('提升')) {
      categories['优化 ⚡'].push(`- ${message}`)
    } else {
      categories['其他 📦'].push(`- ${message}`)
    }
  })

  // Remove empty categories
  Object.keys(categories).forEach(key => {
    if (categories[key].length === 0) {
      delete categories[key]
    }
  })

  return categories
}

function generateMarkdown(): string {
  const commits = getGitCommits()
  if (commits.length === 0) {
    return `---
title: "筑表师更新日志"
description: "DDL建表工具版本更新记录"
---

# 筑表师 Changelog

## [0.1.0] - ${new Date().toISOString().split('T')[0]}

### 新增 🎉
- 初始版本发布
`
  }

  const versions = groupCommitsByVersion(commits)

  let markdown = `---
title: "筑表师更新日志"
description: "DDL建表工具版本更新记录"
---

# 筑表师 Changelog

`

  versions.forEach(version => {
    const categories = categorizeCommits(version.commits)

    markdown += `## [${version.version}] - ${version.date}\n\n`

    Object.entries(categories).forEach(([category, items]) => {
      markdown += `### ${category}\n`
      items.forEach(item => {
        markdown += `${item}\n`
      })
      markdown += '\n'
    })

    if (Object.keys(categories).length === 0) {
      markdown += `### 其他 📦\n- 版本更新\n\n`
    }
  })

  return markdown.trim()
}

function generateChangelog() {
  try {
    const markdown = generateMarkdown()
    const changelogPath = path.resolve(__dirname, '../../public/CHANGELOG.md')

    fs.writeFileSync(changelogPath, markdown, 'utf8')
    console.log('✅ CHANGELOG.md generated successfully from git log')

    // Also update the parsed data
    console.log('🔄 Updating parsed changelog data...')
    execSync('bun run src/scripts/parseChangelog.ts', { encoding: 'utf8' })

  } catch (error) {
    console.error('❌ Error generating changelog:', error)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  generateChangelog()
}

export { generateChangelog, getGitCommits, groupCommitsByVersion, categorizeCommits }