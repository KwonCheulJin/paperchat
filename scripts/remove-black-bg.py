"""모서리에서 연결된 검은 배경만 투명화 (문서 내부 그림자는 보존)."""
from collections import deque
from PIL import Image
import sys

SRC = r"C:\Users\KCJ\personal\paperchat\scripts\paperchat-icon-1024.png"
DST = r"C:\Users\KCJ\personal\paperchat\scripts\paperchat-icon-transparent.png"
THRESHOLD = 30  # R, G, B 모두 이 값 이상이면 "흰 배경" 후보 (아래 로직도 수정)

img = Image.open(SRC).convert("RGBA")
w, h = img.size
pixels = img.load()

# 네 모서리에서 BFS flood fill
visited = [[False] * h for _ in range(w)]
seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
queue = deque()
WHITE_THRESHOLD = 220  # R, G, B 모두 이 값 이상이면 흰 배경 후보

for sx, sy in seeds:
    r, g, b, _ = pixels[sx, sy]
    if r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD:
        queue.append((sx, sy))
        visited[sx][sy] = True

count = 0
while queue:
    x, y = queue.popleft()
    r, g, b, _ = pixels[x, y]
    pixels[x, y] = (0, 0, 0, 0)
    count += 1
    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
            nr, ng, nb, _ = pixels[nx, ny]
            if nr >= WHITE_THRESHOLD and ng >= WHITE_THRESHOLD and nb >= WHITE_THRESHOLD:
                visited[nx][ny] = True
                queue.append((nx, ny))

img.save(DST, "PNG")
print(f"투명화 픽셀: {count:,} / 전체 {w*h:,} ({count*100/(w*h):.1f}%)")
print(f"저장: {DST}")
