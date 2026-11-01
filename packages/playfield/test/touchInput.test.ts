import { describe, expect, it } from 'vitest';
import { TouchLanes } from '../src';

describe('TouchLanes', () => {
  it('누르면 그 레인을 누른다', () => expect(new TouchLanes().down(1, 2)).toEqual({ release: null, press: 2 }));
  it('칸 밖을 누르면 아무것도 누르지 않지만 기억한다', () => {
    const t = new TouchLanes();
    expect(t.down(1, -1)).toEqual({ release: null, press: null });
    expect(t.has(1)).toBe(true);
    expect(t.move(1, 3)).toEqual({ release: null, press: 3 });
  });
  it('옆 칸으로 미끄러지면 원래 레인을 떼고 새 레인을 누른다', () => {
    const t = new TouchLanes();
    t.down(1, 0);
    expect(t.move(1, 1)).toEqual({ release: 0, press: 1 });
    expect(t.move(1, 1)).toEqual({ release: null, press: null });
  });
  it('칸 밖으로 나가면 뗀다', () => {
    const t = new TouchLanes();
    t.down(1, 2);
    expect(t.move(1, -1)).toEqual({ release: 2, press: null });
  });
  it('떼면 그 레인을 떼고 잊는다', () => {
    const t = new TouchLanes();
    t.down(1, 2);
    expect(t.up(1)).toEqual({ release: 2, press: null });
    expect(t.has(1)).toBe(false);
  });
  it('모르는 손가락은 아무 일도 없다', () => {
    const t = new TouchLanes();
    expect(t.move(9, 1)).toEqual({ release: null, press: null });
    expect(t.up(9)).toEqual({ release: null, press: null });
  });
});
