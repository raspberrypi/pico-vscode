# Native node module to access the Windows Registry
This module only has what is needed to support VS Code and is intended to be a lightweight module.

## Installing

```sh
npm install @vscode/windows-registry
```

## Using

```javascript
var vsWinReg = require('vscode-windows-registry');
console.log(vsWinReg.GetStringRegKey('HKEY_LOCAL_MACHINE', 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion', 'ProgramFilesPath');
```

## Development
 * `yarn`
 * `yarn node-gyp configure`
 * `yarn node-gyp build`
 * `yarn tsc`
 * `yarn test`

## License
[MIT](https://github.com/Microsoft/vscode-windows-registry/blob/master/License.txt)


# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

