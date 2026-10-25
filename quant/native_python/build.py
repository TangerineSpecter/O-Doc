"""Explicit local runner setup; build context excludes all project/user data."""
import argparse
import json
import subprocess
from .runtime import IMAGE,DEFAULT_IMAGE,probe


def build():
    base='python:3.11-slim-bookworm'
    subprocess.run(['docker','pull',base],check=True,timeout=300)
    inspected=json.loads(subprocess.check_output(['docker','image','inspect',base],timeout=5))
    digest=next(value for value in inspected[0]['RepoDigests'] if value.startswith('python@sha256:'))
    subprocess.run(['docker','build','--pull=false','--build-arg','BASE_IMAGE='+digest,
        '--tag',DEFAULT_IMAGE,str(IMAGE)],check=True,timeout=600)
    return probe()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build',action='store_true',help='Explicitly pull official Python and build pinned dependencies')
    arguments=parser.parse_args()
    print(json.dumps(build() if arguments.build else probe(),ensure_ascii=False))


if __name__=='__main__':main()
