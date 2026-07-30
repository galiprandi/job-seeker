# Plataformas de Búsqueda Laboral

Catálogo mantenido por la comunidad. El agente lo consulta para decidir dónde buscar según el perfil del usuario.

## Tracking de Alertas (Passive Sourcing)

Plataformas con alertas configuradas. El agente revisa la carpeta `Job Alerts` en Gmail cuando se ejecuta `news`.

| Plataforma | URL | Perfil | Alertas | Filtro Gmail | Última revisión | Notas |
|---|---|---|---|---|---|---|
| HireIndex | hireindex.app | N/A (newsletter) | ✅ Newsletter semanal confirmado | ✅ | 2026-07-30 | AI/ML jobs aggregator. 1678 roles, 800 companies. Double opt-in confirmado |
| Torre | torre.ai | ✅ Login (email+OTP) | ✅ AI matching automático | ✅ | 2026-07-30 | Genome pendiente de completar. Matching automático sin keywords |
| We Work Remotely | weworkremotely.com | — | — | ✅ | — | Cloudflare block. Pendiente login headed |
| Built In | builtin.com | ✅ Google login + onboarding | ✅ Job emails activados | ✅ | 2026-07-30 | Onboarding: EM, Argentina, remote, 11-1000+ emp, Senior/Expert |
| Y Combinator | workatastartup.com | ✅ Magic link login | ✅ Matching por perfil | ✅ | 2026-07-30 | Perfil preexistente. Matching automático sin keywords |

> **Filtro Gmail activo:** `from:(hireindex.app OR torre.ai OR weworkremotely.com OR builtin.com OR workatastartup.com OR ycombinator.com)` → Saltar Recibidos → Aplicar etiqueta "Job Alerts"

## Generales (alto volumen, todos los niveles)

| Plataforma | URL | Tipos de rol | Seniority | Industrias | Geografía | Easy Apply | Anti-bot | Notas |
|---|---|---|---|---|---|---|---|---|
| LinkedIn | linkedin.com/jobs | Todos | Todos | Todas | Global | Sí (parcial) | Alto | Mayor volumen. Detecta automation. MCP oficial disponible |
| Glassdoor | glassdoor.com | Todos | Mid-Senior | Todas | Global | No | Medio | Salary insights y reviews de empresas |
| Indeed | indeed.com | Todos | Todos | Todas | Global | Sí | Medio | GraphQL API capturable. Mucho ruido |
| Remotive | remotive.com | Remote | Todos | Varias | Global | No | Bajo | 125k+ remote jobs. API pública |
| RemoteFront | remotefront.com | Remote | Todos | Varias | Global | No | Bajo | 154k+ jobs de career pages directos. Sin recruiters |
| RemoteOrNothing | remoteornothing.com | Remote | Mid-Senior | Tech | Global | No | Bajo | Solo 100% remote, sin híbrido. Actualiza cada 6h |
| RemNavi | remnavi.com | Remote | Todos | Varias | Global | No | Bajo | Agregador de 7 plataformas. Real Remote Score |
| RemoteJobsGlobal | remotejobsglobal.com | Remote | Todos | Varias | Global | No | Bajo | Solo worldwide remote. 6k+ listings |
| Remote100K | linkedin.com/company/remote100k | Remote | Senior+ | Varias | Global | No | Bajo | Solo $100k+ remote. Vía LinkedIn |

## Tech / Dev-focused

| Plataforma | URL | Tipos de rol | Seniority | Industrias | Geografía | Easy Apply | Anti-bot | Notas |
|---|---|---|---|---|---|---|---|---|
| Get on Board | getonbrd.com | Tech | Mid-Senior | Tech/SaaS | Latam | No | Bajo | Rails form API. Seniority IDs: 4=Senior, 5=Expert |
| Wellfound | wellfound.com | Tech/Startup | Mid-Senior | Startups | Global | No | Alto | GraphQL APQ. OperationIds cambian por deploy. Filtra por location |
| RemoteOK | remoteok.com | Remote/Tech | Todos | Tech | Global | No | Bajo | API pública. Tags por tecnología |
| Remote.co | remote.co | Remote | Todos | Varias | Global | No | Bajo | Solo remoto. Volumen limitado |
| Remotely | remotely.works | Tech | Mid-Senior | Startups US | Latam→US | No | Bajo | Match manual. LATAM devs → US startups. USD salary |
| RemoteRocketship | remoterocketship.com | Tech | Mid-Senior | Tech | Global | No | Bajo | Filtra por país. Buenos listings de Latam |
| RemoteOtter | remoteotter.com | Tech/Leadership | Mid-Senior | Tech | Global | No | Bajo | 270+ engineering leadership roles |
| Remotery | remotery.co | Tech | Mid-Senior | Tech | Global | No | Bajo | Salary visible. Filtro por país |
| YayRemote | yayremote.com | Tech | Mid-Senior | Tech | Global | No | Bajo | Worldwide roles. Salary visible |

## AI / ML specialized

| Plataforma | URL | Tipos de rol | Seniority | Industrias | Geografía | Easy Apply | Anti-bot | Notas |
|---|---|---|---|---|---|---|---|---|
| AIJobs.ai | aijobs.ai | AI/ML/Data | Todos | AI | Global | No | Bajo | Miles de AI jobs. Startups + established |
| NeuralHire | neuralhire.ai | AI/ML/Data | Mid-Senior | AI | Global | No | Bajo | Solo AI/ML. Salary range en cada listing |
| AIRoles | airoles.ai | AI/ML/Leadership | Todos | AI | Global | No | Bajo | Categorías: AI Leader, AI Strategy, AI Safety |
| AIEngJobs | alastairrushworth.com/aiengjobs | AI Engineering | Mid-Senior | AI | Global | No | Bajo | RAG, agents, evals, inference. 3k+ roles. Sin ghost jobs |
| caio.pro | caio.pro | CAIO/VP AI/Head AI | Director+ | AI | Global | No | Bajo | C-level AI exclusivo. Verifica reporting line, comp, AI maturity |

## Engineering Leadership / Executive

| Plataforma | URL | Tipos de rol | Seniority | Industrias | Geografía | Easy Apply | Anti-bot | Notas |
|---|---|---|---|---|---|---|---|---|
| RoleZar | rolezar.ai | Eng Manager | Manager+ | Tech | Global | No | Bajo | Solo eng leadership. Score contra tu perfil. MCP-compatible |
| CTO Jobs HQ | ctojobshq.com | CTO/VP Eng | C-Level | Tech | Global | No | Bajo | CTO roles curados manualmente. Full-time, fractional, contract |
| CTAIO | ctaio.dev | CTO/VP/Director | Director+ | Tech | Global | No | Bajo | 10k+ roles con salary data. Newsletter semanal |
| Next Kahuna | nextkahuna.com | Director+ | Director+ | Varias | Global | No | N/A | Private network. Match silencioso. Solo 85%+ match. Invite-only |
| ExecThread | execthread.org | Executive | VP+ | Varias | Global | No | N/A | Executive jobs confidenciales. Retained search firms |
| jobj.net | jobj.net | Tech | Mid-Senior | Tech | Global | No | Bajo | Private network. AI matching. 70%+ skill match gate |

## Latam-focused

| Plataforma | URL | Tipos de rol | Seniority | Industrias | Geografía | Easy Apply | Anti-bot | Notas |
|---|---|---|---|---|---|---|---|---|
| Computrabajo | computrabajo.com | Generalistas | Junior-Mid | General | Latam | No | Bajo | Fuerte en AR/MX/CL. Dropdowns custom |
| Bumeran | bumeran.com | Generalistas | Junior-Mid | General | Latam | No | Bajo | React-select dropdowns. Fuerte en AR |
| Workana | workana.com | Freelance/Remoto | Todos | Varias | Latam | No | Bajo | Mayormente freelance. No ideal para full-time |
| LatamCent | latamcent.com | Tech | Mid-Senior | Tech | Latam→US | No | Bajo | Staffing firm. Top 1% LATAM talent → US companies |
| ConexionHR | conexion-hr.com | Tech | Mid-Senior | Tech | Latam | No | Bajo | Tech Lead, arquitectura, event-driven. Remoto AR |
