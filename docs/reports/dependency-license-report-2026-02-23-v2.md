# Dependency and License Report (v2)

Generated at: 2026-02-23T12:01:19.967Z

## Policy Gate Summary

- Pass: 12
- Review: 0
- Fail: 0

## License Inventory (Production Dependencies)

| Workspace | Package | License | Status | Reason |
|---|---|---|---|---|
| apps/api | cors@2.8.6 | MIT | PASS | allowlisted |
| poc/render-worker | cors@2.8.6 | MIT | PASS | allowlisted |
| apps/api | dotenv@16.6.1 | BSD-2-Clause | PASS | allowlisted |
| apps/api | express@4.22.1 | MIT | PASS | allowlisted |
| poc/render-worker | express@4.22.1 | MIT | PASS | allowlisted |
| poc/editor-web | mp4box@2.3.0 | BSD-3-Clause | PASS | allowlisted |
| apps/desktop | react-dom@19.2.4 | MIT | PASS | allowlisted |
| poc/editor-web | react-dom@19.2.4 | MIT | PASS | allowlisted |
| apps/desktop | react@19.2.4 | MIT | PASS | allowlisted |
| poc/editor-web | react@19.2.4 | MIT | PASS | allowlisted |
| apps/api | zod@3.25.76 | MIT | PASS | allowlisted |
| poc/render-worker | zod@3.25.76 | MIT | PASS | allowlisted |

## Dependency Trees

### @mav/api

```text
Legend: production dependency, optional only, dev only

@mav/api@0.1.0 /Users/adrienmillot/Desktop/MAV/apps/api (PRIVATE)

dependencies:
cors 2.8.6
├── object-assign 4.1.1
└── vary 1.1.2
dotenv 16.6.1
express 4.22.1
├─┬ accepts 1.3.8
│ ├─┬ mime-types 2.1.35
│ │ └── mime-db 1.52.0
│ └── negotiator 0.6.3
├── array-flatten 1.1.1
├─┬ body-parser 1.20.4
│ ├── bytes 3.1.2
│ ├── content-type 1.0.5
│ ├─┬ debug 2.6.9
│ │ └── ms 2.0.0
│ ├── depd 2.0.0
│ ├── destroy 1.2.0
│ ├─┬ http-errors 2.0.1
│ │ ├── depd 2.0.0
│ │ ├── inherits 2.0.4
│ │ ├── setprototypeof 1.2.0
│ │ ├── statuses 2.0.2
│ │ └── toidentifier 1.0.1
│ ├─┬ iconv-lite 0.4.24
│ │ └── safer-buffer 2.1.2
│ ├─┬ on-finished 2.4.1
│ │ └── ee-first 1.1.1
│ ├─┬ qs 6.14.2
│ │ └─┬ side-channel 1.1.0
│ │   ├── es-errors 1.3.0
│ │   ├── object-inspect 1.13.4
│ │   ├── side-channel-list 1.0.0
│ │   ├── side-channel-map 1.0.1
│ │   └── side-channel-weakmap 1.0.2
│ ├─┬ raw-body 2.5.3
│ │ ├── bytes 3.1.2
│ │ ├─┬ http-errors 2.0.1
│ │ │ ├── depd 2.0.0
│ │ │ ├── inherits 2.0.4
│ │ │ ├── setprototypeof 1.2.0
│ │ │ ├── statuses 2.0.2
│ │ │ └── toidentifier 1.0.1
│ │ ├─┬ iconv-lite 0.4.24
│ │ │ └── safer-buffer 2.1.2
│ │ └── unpipe 1.0.0
│ ├─┬ type-is 1.6.18
│ │ ├── media-typer 0.3.0
│ │ └─┬ mime-types 2.1.35
│ │   └── mime-db 1.52.0
│ └── unpipe 1.0.0
├─┬ content-disposition 0.5.4
│ └── safe-buffer 5.2.1
├── content-type 1.0.5
├── cookie 0.7.2
├── cookie-signature 1.0.7
├─┬ debug 2.6.9
│ └── ms 2.0.0
├── depd 2.0.0
├── encodeurl 2.0.0
├── escape-html 1.0.3
├── etag 1.8.1
├─┬ finalhandler 1.3.2
│ ├─┬ debug 2.6.9
│ │ └── ms 2.0.0
│ ├── encodeurl 2.0.0
│ ├── escape-html 1.0.3
│ ├─┬ on-finished 2.4.1
│ │ └── ee-first 1.1.1
│ ├── parseurl 1.3.3
│ ├── statuses 2.0.2
│ └── unpipe 1.0.0
├── fresh 0.5.2
├─┬ http-errors 2.0.1
│ ├── depd 2.0.0
│ ├── inherits 2.0.4
│ ├── setprototypeof 1.2.0
│ ├── statuses 2.0.2
│ └── toidentifier 1.0.1
├── merge-descriptors 1.0.3
├── methods 1.1.2
├─┬ on-finished 2.4.1
│ └── ee-first 1.1.1
├── parseurl 1.3.3
├── path-to-regexp 0.1.12
├─┬ proxy-addr 2.0.7
│ ├── forwarded 0.2.0
│ └── ipaddr.js 1.9.1
├─┬ qs 6.14.2
│ └─┬ side-channel 1.1.0
│   ├── es-errors 1.3.0
│   ├── object-inspect 1.13.4
│   ├─┬ side-channel-list 1.0.0
│   │ ├── es-errors 1.3.0
│   │ └── object-inspect 1.13.4
│   ├─┬ side-channel-map 1.0.1
│   │ ├── call-bound 1.0.4
│   │ ├── es-errors 1.3.0
│   │ ├── get-intrinsic 1.3.0
│   │ └── object-inspect 1.13.4
│   └─┬ side-channel-weakmap 1.0.2
│     ├── call-bound 1.0.4
│     ├── es-errors 1.3.0
│     ├── get-intrinsic 1.3.0
│     ├── object-inspect 1.13.4
│     └── side-channel-map 1.0.1
├── range-parser 1.2.1
├── safe-buffer 5.2.1
├─┬ send 0.19.2
│ ├─┬ debug 2.6.9
│ │ └── ms 2.0.0
│ ├── depd 2.0.0
│ ├── destroy 1.2.0
│ ├── encodeurl 2.0.0
│ ├── escape-html 1.0.3
│ ├── etag 1.8.1
│ ├── fresh 0.5.2
│ ├─┬ http-errors 2.0.1
│ │ ├── depd 2.0.0
│ │ ├── inherits 2.0.4
│ │ ├── setprototypeof 1.2.0
│ │ ├── statuses 2.0.2
│ │ └── toidentifier 1.0.1
│ ├── mime 1.6.0
│ ├── ms 2.1.3
│ ├─┬ on-finished 2.4.1
│ │ └── ee-first 1.1.1
│ ├── range-parser 1.2.1
│ └── statuses 2.0.2
├─┬ serve-static 1.16.3
│ ├── encodeurl 2.0.0
│ ├── escape-html 1.0.3
│ ├── parseurl 1.3.3
│ └─┬ send 0.19.2
│   ├─┬ debug 2.6.9
│   │ └── ms 2.0.0
│   ├── depd 2.0.0
│   ├── destroy 1.2.0
│   ├── encodeurl 2.0.0
│   ├── escape-html 1.0.3
│   ├── etag 1.8.1
│   ├── fresh 0.5.2
│   ├─┬ http-errors 2.0.1
│   │ ├── depd 2.0.0
│   │ ├── inherits 2.0.4
│   │ ├── setprototypeof 1.2.0
│   │ ├── statuses 2.0.2
│   │ └── toidentifier 1.0.1
│   ├── mime 1.6.0
│   ├── ms 2.1.3
│   ├─┬ on-finished 2.4.1
│   │ └── ee-first 1.1.1
│   ├── range-parser 1.2.1
│   └── statuses 2.0.2
├── setprototypeof 1.2.0
├── statuses 2.0.2
├─┬ type-is 1.6.18
│ ├── media-typer 0.3.0
│ └─┬ mime-types 2.1.35
│   └── mime-db 1.52.0
├── utils-merge 1.0.1
└── vary 1.1.2
zod 3.25.76
```

### @mav/desktop

```text
Legend: production dependency, optional only, dev only

@mav/desktop@0.1.0 /Users/adrienmillot/Desktop/MAV/apps/desktop (PRIVATE)

dependencies:
@mav/shared link:../../packages/shared
react 19.2.4
react-dom 19.2.4
├── react 19.2.4 peer
└── scheduler 0.27.0
```

### @mav/shared

```text
(no production dependencies)
```

### @mav/poc-editor-web

```text
Legend: production dependency, optional only, dev only

@mav/poc-editor-web@0.1.0 /Users/adrienmillot/Desktop/MAV/poc/editor-web (PRIVATE)

dependencies:
mp4box 2.3.0
react 19.2.4
react-dom 19.2.4
├── react 19.2.4 peer
└── scheduler 0.27.0
```

### @mav/poc-render-worker

```text
Legend: production dependency, optional only, dev only

@mav/poc-render-worker@0.1.0 /Users/adrienmillot/Desktop/MAV/poc/render-worker (PRIVATE)

dependencies:
cors 2.8.6
├── object-assign 4.1.1
└── vary 1.1.2
express 4.22.1
├─┬ accepts 1.3.8
│ ├─┬ mime-types 2.1.35
│ │ └── mime-db 1.52.0
│ └── negotiator 0.6.3
├── array-flatten 1.1.1
├─┬ body-parser 1.20.4
│ ├── bytes 3.1.2
│ ├── content-type 1.0.5
│ ├─┬ debug 2.6.9
│ │ └── ms 2.0.0
│ ├── depd 2.0.0
│ ├── destroy 1.2.0
│ ├─┬ http-errors 2.0.1
│ │ ├── depd 2.0.0
│ │ ├── inherits 2.0.4
│ │ ├── setprototypeof 1.2.0
│ │ ├── statuses 2.0.2
│ │ └── toidentifier 1.0.1
│ ├─┬ iconv-lite 0.4.24
│ │ └── safer-buffer 2.1.2
│ ├─┬ on-finished 2.4.1
│ │ └── ee-first 1.1.1
│ ├─┬ qs 6.14.2
│ │ └─┬ side-channel 1.1.0
│ │   ├── es-errors 1.3.0
│ │   ├── object-inspect 1.13.4
│ │   ├── side-channel-list 1.0.0
│ │   ├── side-channel-map 1.0.1
│ │   └── side-channel-weakmap 1.0.2
│ ├─┬ raw-body 2.5.3
│ │ ├── bytes 3.1.2
│ │ ├─┬ http-errors 2.0.1
│ │ │ ├── depd 2.0.0
│ │ │ ├── inherits 2.0.4
│ │ │ ├── setprototypeof 1.2.0
│ │ │ ├── statuses 2.0.2
│ │ │ └── toidentifier 1.0.1
│ │ ├─┬ iconv-lite 0.4.24
│ │ │ └── safer-buffer 2.1.2
│ │ └── unpipe 1.0.0
│ ├─┬ type-is 1.6.18
│ │ ├── media-typer 0.3.0
│ │ └─┬ mime-types 2.1.35
│ │   └── mime-db 1.52.0
│ └── unpipe 1.0.0
├─┬ content-disposition 0.5.4
│ └── safe-buffer 5.2.1
├── content-type 1.0.5
├── cookie 0.7.2
├── cookie-signature 1.0.7
├─┬ debug 2.6.9
│ └── ms 2.0.0
├── depd 2.0.0
├── encodeurl 2.0.0
├── escape-html 1.0.3
├── etag 1.8.1
├─┬ finalhandler 1.3.2
│ ├─┬ debug 2.6.9
│ │ └── ms 2.0.0
│ ├── encodeurl 2.0.0
│ ├── escape-html 1.0.3
│ ├─┬ on-finished 2.4.1
│ │ └── ee-first 1.1.1
│ ├── parseurl 1.3.3
│ ├── statuses 2.0.2
│ └── unpipe 1.0.0
├── fresh 0.5.2
├─┬ http-errors 2.0.1
│ ├── depd 2.0.0
│ ├── inherits 2.0.4
│ ├── setprototypeof 1.2.0
│ ├── statuses 2.0.2
│ └── toidentifier 1.0.1
├── merge-descriptors 1.0.3
├── methods 1.1.2
├─┬ on-finished 2.4.1
│ └── ee-first 1.1.1
├── parseurl 1.3.3
├── path-to-regexp 0.1.12
├─┬ proxy-addr 2.0.7
│ ├── forwarded 0.2.0
│ └── ipaddr.js 1.9.1
├─┬ qs 6.14.2
│ └─┬ side-channel 1.1.0
│   ├── es-errors 1.3.0
│   ├── object-inspect 1.13.4
│   ├─┬ side-channel-list 1.0.0
│   │ ├── es-errors 1.3.0
│   │ └── object-inspect 1.13.4
│   ├─┬ side-channel-map 1.0.1
│   │ ├── call-bound 1.0.4
│   │ ├── es-errors 1.3.0
│   │ ├── get-intrinsic 1.3.0
│   │ └── object-inspect 1.13.4
│   └─┬ side-channel-weakmap 1.0.2
│     ├── call-bound 1.0.4
│     ├── es-errors 1.3.0
│     ├── get-intrinsic 1.3.0
│     ├── object-inspect 1.13.4
│     └── side-channel-map 1.0.1
├── range-parser 1.2.1
├── safe-buffer 5.2.1
├─┬ send 0.19.2
│ ├─┬ debug 2.6.9
│ │ └── ms 2.0.0
│ ├── depd 2.0.0
│ ├── destroy 1.2.0
│ ├── encodeurl 2.0.0
│ ├── escape-html 1.0.3
│ ├── etag 1.8.1
│ ├── fresh 0.5.2
│ ├─┬ http-errors 2.0.1
│ │ ├── depd 2.0.0
│ │ ├── inherits 2.0.4
│ │ ├── setprototypeof 1.2.0
│ │ ├── statuses 2.0.2
│ │ └── toidentifier 1.0.1
│ ├── mime 1.6.0
│ ├── ms 2.1.3
│ ├─┬ on-finished 2.4.1
│ │ └── ee-first 1.1.1
│ ├── range-parser 1.2.1
│ └── statuses 2.0.2
├─┬ serve-static 1.16.3
│ ├── encodeurl 2.0.0
│ ├── escape-html 1.0.3
│ ├── parseurl 1.3.3
│ └─┬ send 0.19.2
│   ├─┬ debug 2.6.9
│   │ └── ms 2.0.0
│   ├── depd 2.0.0
│   ├── destroy 1.2.0
│   ├── encodeurl 2.0.0
│   ├── escape-html 1.0.3
│   ├── etag 1.8.1
│   ├── fresh 0.5.2
│   ├─┬ http-errors 2.0.1
│   │ ├── depd 2.0.0
│   │ ├── inherits 2.0.4
│   │ ├── setprototypeof 1.2.0
│   │ ├── statuses 2.0.2
│   │ └── toidentifier 1.0.1
│   ├── mime 1.6.0
│   ├── ms 2.1.3
│   ├─┬ on-finished 2.4.1
│   │ └── ee-first 1.1.1
│   ├── range-parser 1.2.1
│   └── statuses 2.0.2
├── setprototypeof 1.2.0
├── statuses 2.0.2
├─┬ type-is 1.6.18
│ ├── media-typer 0.3.0
│ └─┬ mime-types 2.1.35
│   └── mime-db 1.52.0
├── utils-merge 1.0.1
└── vary 1.1.2
zod 3.25.76
```

## Notes

- CI gate blocks strong copyleft and unknown/custom licenses for core workspaces.
- Review status is non-blocking and should be manually approved before production use.
