# Job Search Platforms

Community-maintained catalog. The agent consults it to decide where to search based on the user's profile.

## Alert Tracking (Passive Sourcing)

Platforms with configured alerts. The agent checks the `Job Alerts` folder in Gmail when `news` runs.

| Platform | URL | Profile | Alerts | Gmail Filter | Last review | Notes |
|---|---|---|---|---|---|---|
| HireIndex | hireindex.app | N/A (newsletter) | ✅ Weekly newsletter confirmed | ✅ | 2026-07-30 | AI/ML jobs aggregator. 1678 roles, 800 companies. Double opt-in confirmed |
| Torre | torre.ai | ✅ Login (email+OTP) | ✅ Automatic AI matching | ✅ | 2026-07-30 | Genome pending completion. Automatic matching without keywords |
| We Work Remotely | weworkremotely.com | ❌ Removed — paywalled | ❌ Removed — paywalled | ❌ Removed | 2026-07-31 | ⚠️ Paywall: $14.95/mo Basic. Account deleted. Do not subscribe without confirming value first. |
| Built In | builtin.com | ✅ Google login + onboarding | ✅ Job emails enabled | ✅ | 2026-07-30 | Onboarding: EM, Argentina, remote, 11-1000+ emp, Senior/Expert |
| Y Combinator | workatastartup.com | ✅ Magic link login | ✅ Profile-based matching | ✅ | 2026-07-30 | Pre-existing profile. Automatic matching without keywords |

> **Active Gmail filter:** `from:(hireindex.app OR torre.ai OR builtin.com OR workatastartup.com OR ycombinator.com)` → Skip Inbox → Apply label "Job Alerts"

## General (high volume, all levels)

| Platform | URL | Role types | Seniority | Industries | Geography | Easy Apply | Anti-bot | Notes |
|---|---|---|---|---|---|---|---|---|
| LinkedIn | linkedin.com/jobs | All | All | All | Global | Yes (partial) | High | Highest volume. Detects automation. Official MCP available |
| Glassdoor | glassdoor.com | All | Mid-Senior | All | Global | No | Medium | Salary insights and company reviews |
| Indeed | indeed.com | All | All | All | Global | Yes | Medium | Capturable GraphQL API. Lots of noise |
| Remotive | remotive.com | Remote | All | Various | Global | No | Low | 125k+ remote jobs. Public API |
| RemoteFront | remotefront.com | Remote | All | Various | Global | No | Low | 154k+ jobs from direct career pages. No recruiters |
| RemoteOrNothing | remoteornothing.com | Remote | Mid-Senior | Tech | Global | No | Low | 100% remote only, no hybrid. Updates every 6h |
| RemNavi | remnavi.com | Remote | All | Various | Global | No | Low | Aggregator of 7 platforms. Real Remote Score |
| RemoteJobsGlobal | remotejobsglobal.com | Remote | All | Various | Global | No | Low | Worldwide remote only. 6k+ listings |
| Remote100K | linkedin.com/company/remote100k | Remote | Senior+ | Various | Global | No | Low | $100k+ remote only. Via LinkedIn |

## Tech / Dev-focused

| Platform | URL | Role types | Seniority | Industries | Geography | Easy Apply | Anti-bot | Notes |
|---|---|---|---|---|---|---|---|---|
| Get on Board | getonbrd.com | Tech | Mid-Senior | Tech/SaaS | Latam | No | Low | Rails form API. Seniority IDs: 4=Senior, 5=Expert |
| Wellfound | wellfound.com | Tech/Startup | Mid-Senior | Startups | Global | No | High | GraphQL APQ. OperationIds change per deploy. Filter by location |
| RemoteOK | remoteok.com | Remote/Tech | All | Tech | Global | No | Low | Public API. Tags by technology |
| Remote.co | remote.co | Remote | All | Various | Global | No | Low | Remote only. Limited volume |
| Remotely | remotely.works | Tech | Mid-Senior | US Startups | Latam→US | No | Low | Manual match. LATAM devs → US startups. USD salary |
| RemoteRocketship | remoterocketship.com | Tech | Mid-Senior | Tech | Global | No | Low | Filter by country. Good Latam listings |
| RemoteOtter | remoteotter.com | Tech/Leadership | Mid-Senior | Tech | Global | No | Low | 270+ engineering leadership roles |
| Remotery | remotery.co | Tech | Mid-Senior | Tech | Global | No | Low | Salary visible. Filter by country |
| YayRemote | yayremote.com | Tech | Mid-Senior | Tech | Global | No | Low | Worldwide roles. Salary visible |

## AI / ML specialized

| Platform | URL | Role types | Seniority | Industries | Geography | Easy Apply | Anti-bot | Notes |
|---|---|---|---|---|---|---|---|---|
| AIJobs.ai | aijobs.ai | AI/ML/Data | All | AI | Global | No | Low | Thousands of AI jobs. Startups + established |
| NeuralHire | neuralhire.ai | AI/ML/Data | Mid-Senior | AI | Global | No | Low | AI/ML only. Salary range on each listing |
| AIRoles | airoles.ai | AI/ML/Leadership | All | AI | Global | No | Low | Categories: AI Leader, AI Strategy, AI Safety |
| AIEngJobs | alastairrushworth.com/aiengjobs | AI Engineering | Mid-Senior | AI | Global | No | Low | RAG, agents, evals, inference. 3k+ roles. No ghost jobs |
| caio.pro | caio.pro | CAIO/VP AI/Head AI | Director+ | AI | Global | No | Low | C-level AI only. Verifies reporting line, comp, AI maturity |

## Engineering Leadership / Executive

| Platform | URL | Role types | Seniority | Industries | Geography | Easy Apply | Anti-bot | Notes |
|---|---|---|---|---|---|---|---|---|
| RoleZar | rolezar.ai | Eng Manager | Manager+ | Tech | Global | No | Low | Eng leadership only. Score against your profile. MCP-compatible |
| CTO Jobs HQ | ctojobshq.com | CTO/VP Eng | C-Level | Tech | Global | No | Low | Curated CTO roles manually. Full-time, fractional, contract |
| CTAIO | ctaio.dev | CTO/VP/Director | Director+ | Tech | Global | No | Low | 10k+ roles with salary data. Weekly newsletter |
| Next Kahuna | nextkahuna.com | Director+ | Director+ | Various | Global | No | N/A | Private network. Silent match. 85%+ match only. Invite-only |
| ExecThread | execthread.org | Executive | VP+ | Various | Global | No | N/A | Confidential executive jobs. Retained search firms |
| jobj.net | jobj.net | Tech | Mid-Senior | Tech | Global | No | Low | Private network. AI matching. 70%+ skill match gate |

## Latam-focused

| Platform | URL | Role types | Seniority | Industries | Geography | Easy Apply | Anti-bot | Notes |
|---|---|---|---|---|---|---|---|---|
| Computrabajo | computrabajo.com | Generalist | Junior-Mid | General | Latam | No | Low | Strong in AR/MX/CL. Custom dropdowns |
| Bumeran | bumeran.com | Generalist | Junior-Mid | General | Latam | No | Low | React-select dropdowns. Strong in AR |
| Workana | workana.com | Freelance/Remote | All | Various | Latam | No | Low | Mostly freelance. Not ideal for full-time |
| LatamCent | latamcent.com | Tech | Mid-Senior | Tech | Latam→US | No | Low | Staffing firm. Top 1% LATAM talent → US companies |
| ConexionHR | conexion-hr.com | Tech | Mid-Senior | Tech | Latam | No | Low | Tech Lead, architecture, event-driven. Remote AR |
