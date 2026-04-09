# Changelog

## [1.1.0](https://github.com/MicheleBellitti/Cadence/compare/v1.0.0...v1.1.0) (2026-04-09)


### Features

* about + markdown rendering support ([83d1228](https://github.com/MicheleBellitti/Cadence/commit/83d1228edb39d5c75ce2adea6875adedba87e10a))
* add About entry to sidebar and navbar ([615f988](https://github.com/MicheleBellitti/Cadence/commit/615f988fd0779849886dc61aa1cc9252d66d34dc))
* add about page shell with lazy-loaded tutorial sections ([e1ba293](https://github.com/MicheleBellitti/Cadence/commit/e1ba29332fb3eaeefaaa6413adcce357f3ad84db))
* add board tutorial section with scroll-driven card animation ([3384814](https://github.com/MicheleBellitti/Cadence/commit/338481454ea1037f28d86b4b93bf522d72df2395))
* add Gantt tutorial section with progressive reveal ([22a878b](https://github.com/MicheleBellitti/Cadence/commit/22a878b40b06093b757bd1f325017effc1c29a30))
* add hasSeenWelcome state to ui-store ([3ac8ffe](https://github.com/MicheleBellitti/Cadence/commit/3ac8ffe6f8e6b15696439e160bc81ebef60b520b))
* add hero section with scroll-fade animation ([93951f1](https://github.com/MicheleBellitti/Cadence/commit/93951f1225d55fbe2d489ed8bb7c77e3db09b471))
* add MarkdownRenderer component for read-only markdown display ([f8700d8](https://github.com/MicheleBellitti/Cadence/commit/f8700d89754e5f554492e0763021eaca3bb89aa5))
* add MarkdownTextarea component with Edit/Preview tabs ([921a981](https://github.com/MicheleBellitti/Cadence/commit/921a981bddd706dbf9daa6010f579cd8b2a431e0))
* add settings and CTA sections for about page ([097bc96](https://github.com/MicheleBellitti/Cadence/commit/097bc961d1d0283199af73fe76bdedc8204fb012))
* add sprint tutorial section with progress animation ([7aae9ac](https://github.com/MicheleBellitti/Cadence/commit/7aae9ac3636095709f659c7b64536fa9f57ee3f3))
* add useSectionScroll shared hook for about page animations ([aa3708c](https://github.com/MicheleBellitti/Cadence/commit/aa3708c49c5e65c96bc3340f5a4d7dc900b8b57e))
* add welcome banner to dashboard with link to about page ([7766ddb](https://github.com/MicheleBellitti/Cadence/commit/7766ddba52cb2c2757f7aa3a3b2a4ec214b531a4))
* add workload tutorial section with filling grid animation ([c655469](https://github.com/MicheleBellitti/Cadence/commit/c6554695c367922dc714daa27d88f2de3ae0463d))
* replace plain textareas with MarkdownTextarea in item form ([fe0986a](https://github.com/MicheleBellitti/Cadence/commit/fe0986a99f79bbc915321c2e41b2b67d2b82cc16))


### Bug Fixes

* add type=button to MarkdownTextarea tab buttons ([19b5881](https://github.com/MicheleBellitti/Cadence/commit/19b58813a2384dd3d2425c0196d7e0cc2f55bea1))

## 1.0.0 (2026-04-07)


### ⚠ BREAKING CHANGES

* fixed login issues and firebase permissions error. Enhanced colors logic for the gantt visualization.

### Features

* add burndown chart for sprint progress tracking ([da64030](https://github.com/MicheleBellitti/Cadence/commit/da64030b76700f7461ff12e092e76ff81a3e2af6))
* add dashboard page with sprint progress, my tasks, and at-risk sections ([68f825c](https://github.com/MicheleBellitti/Cadence/commit/68f825ca494af7a6cf99349e30cdfdcee4a6223d))
* add forward scheduling engine with topological sort and override support ([581d1f0](https://github.com/MicheleBellitti/Cadence/commit/581d1f050de311c95d0afeb438de4538357c4b8d))
* add sprint bands on Gantt, sprint settings manager, and sample sprint data ([33f6843](https://github.com/MicheleBellitti/Cadence/commit/33f6843cffd589c38260ff9e73e6fd75e160935a))
* define TypeScript data model (Item hierarchy, Project, TeamMember, ScheduledItem) ([49165a9](https://github.com/MicheleBellitti/Cadence/commit/49165a92038935593ae541d51faadc9f8e664962))
* enhance MemberCard with linking functionality for team members ([8ed3caa](https://github.com/MicheleBellitti/Cadence/commit/8ed3caa7b93f8b67a2585d551c9fa6ee2680bf61))
* Firebase migration ([#1](https://github.com/MicheleBellitti/Cadence/issues/1)) ([882aec8](https://github.com/MicheleBellitti/Cadence/commit/882aec8df384bf654847815352a435c45a32477d))
* initialize Next.js 15 project with TypeScript, Tailwind, Zustand, dnd-kit, Vitest ([409dba8](https://github.com/MicheleBellitti/Cadence/commit/409dba8b939d0cae9ec381d0c9bdcc74acb00c24))


### Bug Fixes

* address PR comment ([63c7720](https://github.com/MicheleBellitti/Cadence/commit/63c772013a88268bf1f2e2fa725e26743028ab8b))
* addressing pr comment ([558f6dc](https://github.com/MicheleBellitti/Cadence/commit/558f6dc5b8fe64198e6f19d77012dc7d5d6da05e))
* auth data isolation, /projects page, and notification bell ([51b245a](https://github.com/MicheleBellitti/Cadence/commit/51b245afbaed842c48da64bfae41671db940cc59))
* delete workflow, bugbot is the way. ([cb60e62](https://github.com/MicheleBellitti/Cadence/commit/cb60e623fd27bdafe84c4552547512ed120fd980))
* fixed login issues and firebase permissions error. Enhanced colors logic for the gantt visualization. ([43383e8](https://github.com/MicheleBellitti/Cadence/commit/43383e82ac28bf397b7a2f674242f943b3ac4102))
* Instant signin and invites ([#2](https://github.com/MicheleBellitti/Cadence/issues/2)) ([c684e1a](https://github.com/MicheleBellitti/Cadence/commit/c684e1aedf191d6154b509f2e383b43781378acb))
* remove duplicate Dashboard entry from sidebar navigation ([0a6eb23](https://github.com/MicheleBellitti/Cadence/commit/0a6eb233a623a45b941ce9fed7c62f80e43b650d))
* removed reference to secret, oidc should do the job ([1301bb0](https://github.com/MicheleBellitti/Cadence/commit/1301bb0fce74e03ce2e4564bf011a191ad7153d8))
* resolve lint errors from audit fixes ([03a6577](https://github.com/MicheleBellitti/Cadence/commit/03a65771a2bef0cb2ab5aa48745df3c492a2bf20))
* sos ([a479709](https://github.com/MicheleBellitti/Cadence/commit/a4797095a784be0c6bdcce26db56f7ff2f51db61))
