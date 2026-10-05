# Font sources

## Shantell Sans

- Requested reference: https://www.100font.com/thread-1809.htm
- Upstream: https://github.com/arrowtype/shantell-sans
- Revision: `43932aa9375e60fbcb930b0f865f2f60eae9d206`
- Source file: `fonts/Shantell Sans/Web/Static/Shantell_Sans-Normal-Regular.woff2`
- Local file: `shantell-sans-regular.woff2` (unchanged upstream font).
- Usage: About Me body copy, regular weight 400.
- License: `shantell-sans-OFL.txt`.

## LXGW WenKai

- Upstream: https://github.com/lxgw/LxgwWenKai
- Revision: `8bd6319350fb3ae1904c1cb1a41595ab15d21140`
- Source file: `fonts/TTF/LXGWWenKai-Regular.ttf`
- Local file: `lxgw-wenkai-name.woff2` (web subset containing `(张晋恺)`).
- Usage: The smaller Chinese name beside the English homepage name, regular weight 400.
- License: `lxgw-wenkai-OFL.txt`, including the upstream permission for web-only subsetting/conversion.

Rebuild the name subset with FontTools:

```sh
pyftsubset LXGWWenKai-Regular.ttf '--text=(张晋恺)' --flavor=woff2 \
  --output-file=lxgw-wenkai-name.woff2 --layout-features='*' \
  --name-IDs='*' --name-languages='*'
```

All site font files are served locally; no third-party font requests are made by the page.
The existing Cormorant Garamond and DM Sans fonts retain their adjacent OFL files.
