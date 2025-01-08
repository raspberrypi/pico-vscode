import shutil
import subprocess
import os


def copyMtsToTs(src, dst):
    # Copy but change mts to ts
    dst = dst.replace(".mts", ".ts")
    shutil.copyfile(src, dst)


dir_path = os.path.dirname(os.path.realpath(__file__))
os.chdir(f"{dir_path}/..")

shutil.copytree("./src", "./tmp-translate", copy_function=copyMtsToTs)

os.system("vscode-l10n-dev export --debug --verbose --outDir ./l10n ./tmp-translate")

os.system(
    "vscode-l10n-dev generate-pseudo --debug --verbose --outDir ./l10n ./l10n/bundle.l10n.json ./package.nls.json"
)

shutil.rmtree("./tmp-translate")
