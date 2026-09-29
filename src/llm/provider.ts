import type { NPCContext, Interpretation, DialogueContext, DialogueResult, GoalKind } from '../sim/types';
export interface LLMProvider {
  decideGoal(context: NPCContext): Promise<Pick<Interpretation, 'newGoals'>>;
  interpretEvent(context: NPCContext): Promise<Interpretation>;
  generateDialogue(context: DialogueContext): Promise<DialogueResult>;
}

export class MockLLMProvider implements LLMProvider {
  async decideGoal({ npc, event }: NPCContext): Promise<Pick<Interpretation, 'newGoals'>> {
    let kind: GoalKind = 'secure_food';
    if (event.kind === 'share') kind = npc.personality.empathy > 45 ? 'help_neighbor' : 'make_friend';
    else if (event.kind === 'witness') kind = 'secure_storage';
    else if (event.kind === 'default') kind = 'earn_wealth';
    else if (event.kind === 'scarcity') kind = 'expand_farm';
    return { newGoals: [{ kind, reason: `${event.description} 이 경험이 앞으로의 선택에 영향을 주었다.`.slice(0, 300) }] };
  }
  async interpretEvent(context: NPCContext): Promise<Interpretation> {
    const goals = await this.decideGoal(context);
    return { ...goals, interpretation: context.event.kind === 'share' ? '어려울 때 받은 도움을 기억하고 이웃에게 돌려주고 싶다.' : context.event.kind === 'witness' ? '공동 자원을 지킬 수 있도록 창고를 개선하고 싶다.' : '오늘의 경험을 기억하며 앞으로의 생활을 준비해야겠다.', relationshipInterpretations: [] };
  }
  async generateDialogue({ speaker, listener, memories }: DialogueContext): Promise<DialogueResult> {
    const shared = memories.find(m => m.relatedNpcIds.includes(listener.id));
    return { text: `${listener.identity.name}, ${shared ? `그때 일이 기억나. ${shared.description}` : '오늘 하루는 어땠어?'} — ${speaker.identity.name}` };
  }
}
