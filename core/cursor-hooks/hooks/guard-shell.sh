#!/bin/bash
# 셸 명령 직전에 파괴적 삭제와 force push를 막고, 기본 브랜치 변경과 PR 병합은 사람 확인을 받는다.
# 작업 브랜치 push는 허용한다. Cloud Agent가 브랜치를 올려야 PR을 만들 수 있다.
# failClosed로 등록되므로 모든 분기는 JSON 한 줄을 출력하고 exit 0으로 끝난다.

IFS= read -r -d '' input

emit() {
  printf '{"permission":"%s","user_message":"%s","agent_message":"%s"}\n' "$1" "$2" "$3"
  exit 0
}

field() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$input" | jq -r --arg key "$1" '.[$key] // empty' 2>/dev/null
  elif command -v node >/dev/null 2>&1; then
    printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{try{const v=JSON.parse(s)[process.argv[1]];if(v!=null)process.stdout.write(String(v))}catch{}})' "$1" 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$input" | python3 -c 'import json, sys
try:
    value = json.load(sys.stdin).get(sys.argv[1])
    sys.stdout.write("" if value is None else str(value))
except Exception:
    pass' "$1" 2>/dev/null
  fi
}

cmd=$(field command)
cwd=$(field cwd)

if [ -z "$cmd" ]; then
  emit "ask" "보안 훅이 명령을 읽지 못했습니다. 실행하시겠습니까?" "guard-shell이 명령을 검사하지 못했습니다. 사용자 승인이 필요합니다."
fi

current_branch() {
  [ -n "$cwd" ] || return 0
  local branch
  branch=$(git -C "$cwd" symbolic-ref --short -q HEAD 2>/dev/null) || return 0
  printf '%s' "$branch"
}

on_default_branch() {
  local branch
  branch=$(current_branch)
  [ "$branch" = "main" ] || [ "$branch" = "master" ]
}

re_rm='[[:space:](`]rm[[:space:]]'
re_sudo_rm='[[:space:](`]sudo[[:space:]]+rm[[:space:]]'
re_recursive='[[:space:]](-[[:alnum:]]*[rR]|--recursive)'
re_wide_target='[[:space:]](/|/\*|~|~/|\*|\.|\./|\./\*|\.\.|\.\./|\$HOME|\$\{HOME\})[[:space:])`]'
re_home_child='[[:space:]](~|\$HOME|\$\{HOME\})/'
re_core_dir='[[:space:]](\./)?(lib|src|app|test|ios|android|assets|\.git)/?[[:space:])`]'
re_push='[[:space:]]git[[:space:]](.*[[:space:]])?push[[:space:]]'
re_force='[[:space:]](--force|-f|\+[^[:space:]]+)[[:space:]]'
re_lease='[[:space:]]--force-(with-lease|if-includes)'
re_protected='[[:space:]:/](main|master)[[:space:]]'
re_bulk='[[:space:]](--all|--mirror|--delete|-d)[[:space:]]'
re_commit='[[:space:]]git[[:space:]](.*[[:space:]])?commit[[:space:]]'
re_reset_hard='[[:space:]]git[[:space:]](.*[[:space:]])?reset[[:space:]](.*[[:space:]])?--hard[[:space:]]'
re_clean_force='[[:space:]]git[[:space:]](.*[[:space:]])?clean[[:space:]](.*[[:space:]])?-[[:alnum:]]*f'
re_pr_merge='[[:space:]]gh[[:space:]]+pr[[:space:]]+merge[[:space:]]'

plain=${cmd//\"/}
plain=${plain//\'/}
segments=${plain//[;|&]/$'\n'}
ask_user=""
ask_agent=""

ask_later() {
  if [ -z "$ask_user" ]; then
    ask_user=$1
    ask_agent=$2
  fi
}

push_needs_branch_check() {
  local after token positional=0 refspec=""
  after=${1#* push }
  set -f
  read -ra tokens <<< "$after"
  set +f
  for token in "${tokens[@]}"; do
    case $token in
      -*) ;;
      *)
        positional=$((positional + 1))
        [ "$positional" -ge 2 ] && refspec=$token
        ;;
    esac
  done
  [ -z "$refspec" ] || [ "$refspec" = "HEAD" ]
}

while IFS= read -r seg; do
  seg=" $seg "

  if [[ $seg =~ $re_sudo_rm ]]; then
    emit "deny" "위험한 명령이 차단되었습니다 (sudo rm)." "sudo를 사용한 삭제는 허용되지 않습니다."
  fi

  if [[ $seg =~ $re_rm ]] && [[ $seg =~ $re_recursive ]]; then
    if [[ $seg =~ $re_wide_target ]] || [[ $seg =~ $re_home_child ]]; then
      emit "deny" "위험한 명령이 차단되었습니다 (루트·홈·전체 트리 재귀 삭제)." "루트, 홈, 상위, 전체 트리 삭제는 허용되지 않습니다."
    fi
    if [[ $seg =~ $re_core_dir ]]; then
      emit "deny" "위험한 명령이 차단되었습니다 (프로젝트 핵심 디렉터리 재귀 삭제)." "lib, src, app, test, ios, android, assets, .git 전체 삭제는 허용되지 않습니다. 개별 파일이나 하위 경로를 지우세요."
    fi
  fi

  if [[ $seg =~ $re_push ]]; then
    if [[ $seg =~ $re_force ]]; then
      emit "deny" "위험한 명령이 차단되었습니다 (force push)." "무조건적인 force push는 허용되지 않습니다. 필요하면 --force-with-lease를 사용하세요."
    fi
    if [[ $seg =~ $re_lease ]]; then
      ask_later "원격 이력을 바꾸는 push입니다. 실행하시겠습니까?" "--force-with-lease push는 사용자 승인이 필요합니다."
    elif [[ $seg =~ $re_protected ]] || [[ $seg =~ $re_bulk ]]; then
      ask_later "기본 브랜치나 여러 ref를 바꾸는 push입니다. 실행하시겠습니까?" "main, master, 전체 ref, 원격 삭제 push는 사용자 승인이 필요합니다."
    elif push_needs_branch_check "$seg"; then
      branch=$(current_branch)
      if [ -z "$branch" ] || [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
        ask_later "현재 브랜치를 push 합니다. 실행하시겠습니까?" "기본 브랜치이거나 브랜치를 확인하지 못한 push는 사용자 승인이 필요합니다."
      fi
    fi
  fi

  if [[ $seg =~ $re_commit ]] && on_default_branch; then
    ask_later "기본 브랜치에 직접 커밋합니다. 실행하시겠습니까?" "main, master 직접 커밋은 사용자 승인이 필요합니다. 작업 브랜치를 만드세요."
  fi

  if [[ $seg =~ $re_reset_hard ]] || [[ $seg =~ $re_clean_force ]]; then
    ask_later "로컬 변경을 되돌리거나 추적되지 않은 파일을 지웁니다. 실행하시겠습니까?" "reset --hard, clean -f는 사용자 승인이 필요합니다."
  fi

  if [[ $seg =~ $re_pr_merge ]]; then
    ask_later "PR을 병합합니다. 실행하시겠습니까?" "PR 병합은 사람이 승인합니다."
  fi
done <<< "$segments"

if [ -n "$ask_user" ]; then
  emit "ask" "$ask_user" "$ask_agent"
fi

emit "allow" "" ""
