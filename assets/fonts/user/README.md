# User fonts (not published)

Put your own (often commercial) fonts here, one folder per family:

```
assets/fonts/user/Peyda/Peyda-Bold.woff2
assets/fonts/user/Peyda/Peyda-Black.woff2
assets/fonts/user/Hasti/Hasti-Heavy.ttf
```

Everything in this folder except this README is git-ignored. A weight word in the file name
(`Thin`, `Light`, `Regular`, `Medium`, `SemiBold`, `Bold`, `ExtraBold`, `Black`, `Heavy`) sets the weight;
other files are treated as variable fonts. Use a family in the spec: `"fonts": {"display": "Hasti", "body": "Peyda"}`.
