/** 손가락 한 번의 변화: 뗄 레인과 누를 레인 (없으면 null). */
export interface LaneMove {
  release: number | null;
  press: number | null;
}

/**
 * 손가락(포인터 id)마다 지금 누르고 있는 레인(-1은 칸 밖)을 기억한다.
 * 여러 손가락이 한 레인을 누르는 셈은 하지 않는다 (`Playfield`가 `HeldKeys`로 센다).
 */
export class TouchLanes {
  private readonly lanes = new Map<number, number>();

  down(id: number, lane: number): LaneMove {
    this.lanes.set(id, lane);
    return { release: null, press: lane >= 0 ? lane : null };
  }

  move(id: number, lane: number): LaneMove {
    const prev = this.lanes.get(id);
    if (prev === undefined || prev === lane) return { release: null, press: null };
    this.lanes.set(id, lane);
    return { release: prev >= 0 ? prev : null, press: lane >= 0 ? lane : null };
  }

  up(id: number): LaneMove {
    const prev = this.lanes.get(id);
    if (prev === undefined) return { release: null, press: null };
    this.lanes.delete(id);
    return { release: prev >= 0 ? prev : null, press: null };
  }

  has(id: number): boolean {
    return this.lanes.has(id);
  }

  clear(): void {
    this.lanes.clear();
  }
}
