import { useState } from 'react';
import GameIcon from './GameIcon';
import type { GameIconName } from './GameIcon';

interface HintCategory {
  title: string;
  icon: GameIconName;
  tips: string[];
}

const HINTS: HintCategory[] = [
  {
    title: 'Unrest & Rebellion',
    icon: 'warning',
    tips: [
      'Unrest rises by +2 each turn in provinces without a garrisoned army.',
      'Enemy armies in your province cause +8 unrest per turn — expel them quickly.',
      'Garrison a friendly army to reduce unrest by 5 per turn.',
      'Provinces at Dev Level 3+ get a small stability bonus (-1 unrest/turn).',
      'At 100 unrest, a province rebels and becomes independent. Rebel provinces spread +5 unrest to all adjacent owned provinces.',
      'To reclaim a rebel province, move a friendly army into it.',
    ],
  },
  {
    title: 'Diplomacy',
    icon: 'diplomacy',
    tips: [
      'Relations drift toward 0 each turn. Actively manage them before they fade.',
      'Trade Deals activate trade routes on shared borders, generating bonus gold from trade value.',
      'Non-Aggression Pacts (NAPs) help stabilize volatile borders.',
      'Alliances require 50+ relation. Allied nations automatically join your wars.',
      'You can only declare war on nations where relation is negative.',
      'Breaking agreements causes a relation penalty: NAP -20, Trade -10, Alliance -30, Vassalage -25.',
      'Vassals pay 10% of their gold and production to their overlord each turn.',
    ],
  },
  {
    title: 'Economy',
    icon: 'gold',
    tips: [
      'Each province produces resources based on its Development Level and Focus.',
      'Armies consume food equal to their total strength each turn. Starving armies are a liability.',
      'Gold is the primary currency — needed for development upgrades and mercenary hires.',
      'Influence has a soft cap based on your archetype. Excess influence decays 10% per turn. Trade Deals raise the cap by +5 each.',
      'Manpower has a soft cap based on population and dev level. It stops accumulating above the cap.',
      'Trade Deals also grant intel on the partner nation\'s economy.',
    ],
  },
  {
    title: 'Province Focus',
    icon: 'production',
    tips: [
      'Set a Focus at Dev Level 2+ to specialize your provinces.',
      'Agricultural: produces Food (essential for feeding armies).',
      'Industrial: produces Production (needed for construction and forts).',
      'Commercial: produces Gold (highest raw output, great for trade-heavy strategies).',
      'Military: produces Manpower (key for fielding large armies).',
      'Higher Dev Levels dramatically increase output. Level 5 provinces are economic powerhouses.',
    ],
  },
  {
    title: 'Military',
    icon: 'manpower',
    tips: [
      'Larger armies generally win, but forts and terrain give the defender an advantage.',
      'Mountain terrain provides the strongest defensive bonus. Forests are also defensible.',
      'Fortifications add to the defender\'s effective strength. Fort Level 3 is a serious obstacle.',
      'Major battles (30+ combined strength) are fought over multiple rounds with attrition.',
      'Naval fleets can blockade trade routes, disrupting enemy income.',
      'Hire Mercenaries as a Wildcard action to boost manpower quickly (costs gold).',
    ],
  },
  {
    title: 'Action Budget',
    icon: 'action-budget',
    tips: [
      'You have four action categories per turn: Diplomatic, Military, Construction, and Wildcard.',
      'Plan your actions carefully — budget is limited and unused actions are wasted.',
      'Diplomatic actions: propose agreements, declare war, offer peace.',
      'Military actions: move armies, retreat, blockade.',
      'Construction actions: upgrade development, set focus, build forts.',
      'Wildcard actions: spy, hire mercenaries, restore nations.',
    ],
  },
  {
    title: 'Victory',
    icon: 'victory',
    tips: [
      'Each scenario has its own victory conditions — check them early and plan accordingly.',
      'Control Regions: hold specific provinces for a set number of turns.',
      'Domination: control a percentage of all provinces.',
      'If no one meets the primary objective, the highest total score wins at the turn limit.',
      'Score is based on development, gold stockpile, and active agreements.',
    ],
  },
];

export default function HintsButton() {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);

  return (
    <>
      <button className="hints-btn" onClick={() => setOpen(true)} title="Game Hints">
        <GameIcon name="hints" size={14} /> Hints
      </button>

      {open && (
        <div className="hints-backdrop" onClick={() => setOpen(false)}>
          <div className="hints-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hints-modal__header">
              <span className="hints-modal__title">Game Hints</span>
              <button className="hints-modal__close" onClick={() => setOpen(false)}>
                <GameIcon name="close" size={16} />
              </button>
            </div>

            <div className="hints-modal__body">
              <div className="hints-modal__categories">
                {HINTS.map((cat, i) => (
                  <button
                    key={i}
                    className={`hints-modal__cat-btn${i === activeCategory ? ' hints-modal__cat-btn--active' : ''}`}
                    onClick={() => setActiveCategory(i)}
                  >
                    <span className="hints-modal__cat-icon">
                      <GameIcon name={cat.icon} size={14} />
                    </span>
                    <span className="hints-modal__cat-label">{cat.title}</span>
                  </button>
                ))}
              </div>

              <div className="hints-modal__tips">
                <div className="hints-modal__tips-title">
                  <GameIcon name={HINTS[activeCategory].icon} size={16} /> {HINTS[activeCategory].title}
                </div>
                <ul className="hints-modal__tips-list">
                  {HINTS[activeCategory].tips.map((tip, i) => (
                    <li key={i} className="hints-modal__tip" style={{ animationDelay: `${i * 0.04}s` }}>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
