import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildNormalityLine, malScoreSummary } from "./lib/analysis";
import { createEloState, recordOutcome, selectPair } from "./lib/elo";
import { fetchAnimeMedia } from "./lib/jikan";
import { parseMalExport } from "./lib/mal";
import { createRng } from "./lib/random";
import {
  buildResults,
  resultsToCsv,
  resultsToJson,
  BlendingParams,
  computeEloWeight,
} from "./lib/results";
import {
  fitNormal,
  normalCdf,
  percentile,
  score10FromPercentile,
} from "./lib/scoring";
import { fetchShikimoriAnimeList } from "./lib/shikimori";
import {
  AnimeEntry,
  AnimeListExport,
  AnimeMedia,
  AnimeResult,
  EloState,
  Rating,
} from "./lib/types";

const STORAGE_KEY = "anime-ranker-state-v1";

const comparisonTargets = (n: number, comparisonScale: number) => {
  if (n <= 0 || comparisonScale <= 0) {
    return { meaningfulMin: 0, optimal: 0, excessive: 0 };
  }
  const total = (avgGames: number) =>
    Math.max(1, Math.round(((avgGames * n) / 2) * comparisonScale));
  return {
    meaningfulMin: total(2),
    optimal: total(4),
    excessive: total(7),
  };
};

const safeBaseName = (name: string) => {
  const cleaned = name
    .split("")
    .filter((ch) => /[a-zA-Z0-9\-_. ]/.test(ch))
    .join("")
    .trim();
  return cleaned || "results";
};

const downloadBlob = (name: string, data: string, type: string) => {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

type AppliedSettings = {
  comparisonsTarget: number;
  kFactor: number;
  avoidRepeats: boolean;
  assumeDroppedLower: boolean;
  statuses: string[];
  malNormality: number;
  normalityMultiplier: number;
};

type StoredEloState = {
  ratings: [number, Rating][];
  comparisons: number;
  skips: number;
  pairHistory: string[];
  kFactor: number;
  initialRating: number;
};

type StoredState = {
  version: 1;
  exportData: AnimeListExport;
  fileName: string | null;
  statusFilter: string[];
  showPosters: boolean;
  showEnglish: boolean;
  assumeDroppedLower: boolean;
  avoidRepeats: boolean;
  kFactor: number;
  comparisonsTarget: number;
  settingsConfirmed: boolean;
  appliedSettings: AppliedSettings | null;
  appliedAnimeIds: number[];
  scoreMeanTarget: number | null;
  autoDecisions: number;
  currentPair: [number, number] | null;
  eloState: StoredEloState | null;
};

const serializeEloState = (elo: EloState): StoredEloState => ({
  ratings: Array.from(elo.ratings.entries()),
  comparisons: elo.comparisons,
  skips: elo.skips,
  pairHistory: Array.from(elo.pairHistory),
  kFactor: elo.kFactor,
  initialRating: elo.initialRating,
});

const deserializeEloState = (raw: StoredEloState): EloState => ({
  ratings: new Map(raw.ratings),
  comparisons: raw.comparisons,
  skips: raw.skips,
  pairHistory: new Set(raw.pairHistory),
  kFactor: raw.kFactor,
  initialRating: raw.initialRating,
});

type SkipDecision = {
  outcome: number;
  reason: string;
};

const MalIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    style={{ verticalAlign: "middle", marginRight: 6 }}
  >
    <path
      d="M8.45 15.91H6.067v-5.506h-.028l-1.833 2.454-1.796-2.454H2.39v5.507H0V6.808h2.263l1.943 2.671 1.98-2.671H8.45zm8.499 0h-2.384v-2.883H11.96c.008 1.011.373 1.989.914 2.884l-1.942 1.284c-.52-.793-1.415-2.458-1.415-4.527 0-1.015.211-2.942 1.638-4.37a4.809 4.809 0 0 1 2.737-1.37c.96-.15 1.936-.12 2.905-.12l.555 2.051H15.48c-.776 0-1.389.113-1.839.337-.637.32-1.009.622-1.447 1.78h2.372v-1.84h2.384zm3.922-2.05H24l-.555 2.05h-4.962V6.809h2.388z"
      fill="#888"
    />
  </svg>
);

const ShikimoriIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    style={{ verticalAlign: "middle", marginRight: 6 }}
  >
    <path
      d="M2.8025.0025C2.7779.03 2.8332.1223 2.9834.3c.0981.1134.1594.2328.233.4444.0551.1594.1198.3157.1443.3464.0368.049.0396.037.0427-.1102V.8181l.218.3004c.331.4568.5365.6992.6744.7973.0706.046.1136.0919.0952.098-.049.0153-.4785-.2208-.6778-.374-.1012-.0767-.196-.1411-.2114-.1411-.0153 0-.0644-.0461-.1073-.1013-.0399-.0552-.1348-.1408-.2053-.1898-.1717-.1196-.3527-.2913-.3957-.374C2.763.7721 2.668.7323 2.668.7814c0 .049.245.377.435.5793.5825.6224 1.1776.932 2.7688 1.4287.3373.1043.6347.2085.6623.233.0246.0215.0737.0398.1074.0398.0306 0 .0795.0152.104.0305.0399.0245.0367.031-.0093.031-.0368 0-.0521.018-.046.0548.0092.0552.1595.1045.4477.1444.1287.0184.1593.0124.1593-.0244 0-.049-.0889-.083-.2207-.083-.049 0-.0858-.0151-.0858-.0304 0-.0184.031-.025.0708-.0188.0368.0092.1652.0306.2817.052.276.046.353.0768.353.135 0 .0644.0826.092.1377.046.0307-.0276.046-.0274.046-.0028 0 .0183.0151.0337.0304.0337.0184 0 .031-.0214.031-.046 0-.0582-.0309-.0586.4842.0212.3066.046.42.077.374.0923-.098.0368-.0428.0858.0952.0858.0705 0 .1195.0153.1195.0337 0 .0276.0704.0306.2452.0183.1594-.0123.2516-.0093.2639.0122.0122.0184.0643.0275.1195.0183.0521-.0092.1961.0034.3126.0248.3066.0583 1.1313.1044 2.977.1688 2.983.1042 5.157.3277 5.9726.6159.3617.1287.9075.4048 1.0087.509.1594.1686.2082.3066.1898.5334-.0092.1135-.0092.2149 0 .2241.089.089.2855-.0859.2855-.2545 0-.0338.0639-.1165.1467-.187.331-.2913.3803-.454.3436-1.1194-.0246-.4476-.031-.4782-.2302-1.1343-.2606-.8585-.3215-.9903-.6342-1.3214-.3679-.3863-.7023-.6072-1.1592-.7635-.1103-.0368-.3434-.1224-.5212-.1899-.2483-.098-.4262-.141-.788-.1931-.512-.0736-1.6126-.1256-1.956-.0919-.1226.0123-.6132 0-1.1498-.0337-.61-.0337-.984-.046-1.0729-.0277-.0766.0154-.2085.0274-.2944.0305-.1257 0-.1837.0187-.291.0984-.1257.092-.2149.1194-.5644.1777-.5641.092-.929.1653-1.0823.2175-.1196.0429-.3157.0706-.6192.089-.8309.0521-1.3029.0952-1.4071.129-.0706.0214-.3406.0274-.7913.0182-.5488-.0123-.6895-.006-.7171.0277-.0276.0306-.0155.0398.0581.0398.1809 0 1.7968.1258 1.8121.141.0154.0154-.273.003-1.0977-.0491-.2423-.0154-.4567-.0186-.472-.0094-.0583.0368-.4939.0307-.9108-.0122-.515-.0521-1.0115-.138-1.4714-.2545-.2146-.0521-.4662-.0916-.644-.1008-.328-.0153-.6778-.129-1.1714-.3773-.325-.1625-.3614-.1684-.3614-.0366v.1008L3.244.5331c-.0552-.0644-.1224-.1689-.15-.2302-.0552-.1165-.2609-.328-.2915-.3004zm.4584 3.1887c-.5697.0269-1.0938.4707-1.47 1.2628-.2238.4752-.2635.6593-.2789 1.291-.0122.4966-.0063.598.0642 1.0119.1503.8615.19.9625.5058 1.2721.3342.3312 1.1654.785 1.6284.8892.1594.0338.3464.0768.4139.0952.2575.0644.61.0885 1.4868.1008.8431.0153.9136.0125 1.027-.0427.0797-.0398.2486-.0707.4908-.089.2023-.0184.4165-.0459.4748-.0643.0582-.0153.1841-.0309.276-.0309.0951 0 .1903-.0182.2087-.0366.0735-.0735.4228-.1503.757-.1687.187-.0092.3621-.0273.3928-.0427.1011-.0551.052-.0859-.1135-.0675-.095.0092-.187.003-.2207-.0154-.0491-.0307-.034-.0335.0825-.0366.0766 0 .2269-.0093.3342-.0216.1655-.0153.1842-.0248.1382-.0585-.1134-.0828-.0153-.1041.4936-.1041.4568 0 .5886-.0215.4537-.0736-.0275-.0092-.1413-.0216-.2517-.0216-.1134-.003-.1624-.0119-.1134-.015.0521-.006.1628-.0277.2517-.043.0859-.0185.6255-.0399 1.1958-.046.5702-.0061 1.0542-.0124 1.0757-.0155.0276 0 .0338-.0215.0216-.0614-.0123-.043-.0061-.061.0276-.061.0245 0 .083-.049.129-.1073.0919-.1195.1161-.1137.156.0427l.0277.1012.2207.0094c.1748.0061.2333-.003.2916-.046.0398-.0306.1224-.0645.1837-.0768l.1135-.0216-.0183.1782c-.0184.144-.0152.1716.0215.1593.0246-.0092.1222-.0338.2203-.0553l.1749-.0337-.0675-.089c-.043-.0491-.1226-.098-.1931-.1163l-.1224-.031.1838-.006a4.812 4.812 0 0 1 .3004 0c.0644.003.1135-.0089.1135-.0272 0-.0184-.0182-.034-.0366-.037-.0215-.0031-.089-.0064-.1472-.0095-.0582-.006-.1564-.0398-.2147-.0735-.0582-.0368-.1317-.067-.1593-.067-.0307 0-.0553-.0157-.0553-.031 0-.0215.092-.0305.2545-.0244.2483.0092.2514.0091.2606.0919.0123.095.0122.095.0797.0675a.0498.0498 0 0 0 .0305-.0581c-.0184-.049.037-.0893.083-.0586.0183.0092.0918.0215.1593.0276.1655.0092.9718.0737 1.1803.0952.1103.0122.1593.0307.1593.0614 0 .0521.037.0549.083.0089.0245-.0245.1442-.021.4354.0066.3557.0337.4017.0425.4017.0946 0 .0368.0213.0556.0704.0586.0368 0 .1656.0121.2821.0244.1196.0123.2329.0181.2513.009.0214-.0062.0891-.0979.1504-.2021.1196-.1993.2208-.3253.2607-.3253.0153 0 .018.0219.0089.0464-.0123.0245-.003.046.0154.046.0215 0 .0338.0244.0277.052-.0061.0367.0213.0582.0919.0735.1134.0246.1657.0582.089.0582-.0276 0-.0525.0183-.0525.0398 0 .0215.1812.0984.4448.1842.2821.095.4444.1623.4444.1899 0 .0306-.095.0092-.3586-.0797-.6254-.2146-.898-.2606-.898-.1533 0 .046.0488.0676.285.1228.1532.0368.3002.0642.3248.0642.0214 0 .0798.0338.1289.0736.049.043.294.144.5638.233.273.092.5153.19.5644.233.049.0398.1349.0952.1931.1166.1932.0828.4693.3309.6778.6099.3005.4047.2973.3895.1317.3895-.0766 0-.2946-.0214-.4847-.046-.19-.0245-.429-.0461-.53-.0492-.2147-.0061-1.9684.0278-2.6245.0493l-.4449.0154-.0703-.1504c-.0398-.0828-.1533-.2298-.2545-.331-.1747-.1717-.1837-.175-.2236-.1167-.0245.0337-.1168.1626-.2057.2822l-.1622.2236-.1992.0065c-.1104 0-.2242.0031-.2517 0-.0675-.006-.0703.0305-.009.144l.0427.0857-.3126.0216c-.8524.0582-2.661.282-3.268.4078-.135.0276-.4203.049-.6778.052-.46.0061-.5028.0184-.794.187-.0522.0276-.0922.0339-.129.0155-.0337-.0215-.0643-.0154-.0858.0122-.0337.0398-.144.058-.9534.1439-.1778.0184-.475.0584-.665.089-.3312.0552-.3499.0552-.5246 0-.184-.0582-.7572-.135-1.2478-.1687l-.276-.0216-.1622.1472c-.092.0797-.218.2177-.2855.3066-.092.1257-.141.166-.1992.166-.1257 0-1.2448.1743-2.0573.3215-.8768.1594-1.2077.1904-1.4652.1382-.2668-.0551-.2701-.0583-.2578-.3956.0122-.2851.0093-.2941-.0643-.3309-.1686-.0858-.331-.0371-.5517.1622-.052.046-.1133.0675-.1992.0675-.0705-.003-.1993.0306-.3004.0797l-.181.083.009.1593c.006.0858-.0032.1868-.0216.2175-.0245.0368-.0306.1994-.0183.4692.0123.328.003.4476-.0398.607l-.052.1964.1471.2086c.2943.4139.503.7294.503.763 0 .0185.0916.1169.208.218.506.4446.7207.5642 1.2174.6685.5273.1134.6131.1072.9412-.0675.1502-.0828.3251-.1965.3895-.2578.0797-.0736.3067-.1931.742-.3863.6776-.3004.7631-.3342.7631-.2943 0 .0122.043.426.0952.9135.1073 1.024.1411 2.0052.0951 2.7595-.0368.5917-.0644.6743-.4814 1.4591-.6469 1.2172-1.4224 2.3947-2.008 3.0477-.1043.1196-.2636.325-.3525.4599-.1686.2544-.4815.595-.871.9445-.1317.1195-.2177.2206-.2085.2451.0092.0245.1046.0734.2119.1102.1042.0398.2052.083.2236.0984.049.049.1101.0303.337-.0924l.2207-.1223.0891.0614c.1073.0705.3006.0763.4631.015.0644-.0245.1932-.052.2883-.0581.19-.0184.3126-.0703.5118-.2236.0736-.0552.1687-.1073.2147-.1195.089-.0184.8585-.7976 1.2694-1.2881.1287-.1502.4506-.4905.7204-.7542.3771-.374.5457-.5148.7603-.6436.3096-.184.5548-.4076.5854-.5395.0123-.046.052-.1413.0919-.2118.095-.1625.2024-.5792.1748-.6835-.0092-.0429-.0552-.147-.1012-.233-.0797-.141-.0855-.1901-.1008-.5826-.0276-.6898-.138-1.0515-.4875-1.5941-.2023-.3127-.2516-.4231-.3773-.8278-.2085-.696-.2697-1.3493-.1655-1.8613.049-.2545.0735-.2883.279-.4078.1072-.0644.2484-.1656.3159-.227l.1256-.1162.5948-.0675c.328-.0398.6958-.0889.8123-.1134.1196-.0245.3831-.0797.5855-.1195.2054-.043.497-.1164.6473-.1655.1502-.0521.3616-.1137.472-.1383.2146-.049.9472-.1192.9717-.0946.0092.0092.0185.4476.0155.975 0 .8277-.0092 1.0515-.0797 1.6616-.1196 1.0455-.1442 1.3732-.1749 2.526-.0276 1.1466-.0365 1.1986-.2236 1.3335-.1349.0981-.2728.0802-.6806-.1007-.2023-.089-.6286-.264-.9505-.3928-.3189-.1288-.7727-.3277-1.0027-.4411-.233-.1165-.4232-.2028-.4232-.1936 0 .0092.1165.1595.2606.3342.144.1748.2606.325.2606.3342 0 .0092-.0274.0188-.0642.0188-.0552 0-.0584.006-.0155.0642.0276.0398.0369.101.0277.1654-.0123.0828-.0032.1106.058.1505.04.0276.1046.1041.1445.1716.0368.0643.1012.147.141.1776.04.0307.098.1044.1318.1627.0306.0582.1348.1654.233.239.098.0736.193.1687.2113.2086.0184.046.1077.1133.2119.1655.2422.1226.5975.4353.6557.5732.0338.0859.1015.1534.2977.2822.1564.1042.4321.3433.7387.6469.558.5518.5887.5703 1.0425.5427.2943-.0214.4416-.0768.6164-.2362.0705-.0644.1563-.1316.187-.15.0306-.0184.1072-.1072.1655-.1992.0582-.095.147-.1932.193-.2208.1288-.0766.3587-.402.3587-.5062 0-.1533.0582-.251.2606-.441.1778-.1656.2149-.2213.3253-.4941.1717-.417.2326-.6864.2878-1.223.0674-.6622.0616-1.4623-.015-1.962-.1257-.8156-.604-3.0876-.7481-3.5414-.1196-.377-.233-.8676-.233-1.0087 0-.0337.064-.0369.3155-.0215.23.0153.4108.0094.6745-.0305.3127-.046.4202-.049.7514-.0183.2115.0184.3923.0396.3984.0488.0245.0214.4968 1.5575.5765 1.8702.1656.6408.1688.687.2025 2.2996.0153.8431.0304 1.8426.0366 2.2228.0061.6407.0124.7111.089.9932.0981.3587.2054.5919.4261.9108.089.1257.2238.3464.3005.4874.1533.2852.3527.521.6103.7172.3372.2606.6652.4724.8676.5644.2422.1103.4382.2849.6314.5577.0797.1104.1932.2609.2545.3375.0613.0767.1378.1932.1716.2607.0582.1226.0766.1348.4078.233.1532.0459.5762.0548.8123.015.1318-.0216.1812-.052.3928-.2574.285-.276.42-.469.42-.607 0-.2146.0303-.279.156-.3281.0798-.0307.1196-.0673.1196-.1041 0-.1932-.2023-.9723-.3066-1.1747-.0674-.1349-.9471-1.324-1.686-2.2836-.7849-1.0148-1.061-1.4567-1.2234-1.935-.0521-.1624-.2481-1.2754-.3708-2.143-.0889-.6224-.2608-1.2386-.5306-1.9223-.092-.233-.1564-.4228-.141-.4228.0735 0 1.6526.4415 1.7445.4875.0583.0307.2974.159.5274.2878.23.1318.4537.2363.4935.2363.046 0 .239.1073.466.2606l.3895.2606.2025-.0155c.2912-.0276.346-.0398.4687-.1256.1748-.1196.2792-.138.4172-.0736.2667.1257.4507.1472.2883.0338-.2422-.1687-.2667-.2516-.1257-.4632.1687-.2575.1867-.2757.3614-.3646.279-.141.2976-.1745.3895-.6774.043-.2452.1011-.4848.1257-.5338.0705-.1472.0553-.2419-.0642-.3553-.0614-.0583-.1627-.1904-.2302-.2916-.095-.1472-.1223-.2175-.1223-.3248 0-.1196-.0124-.144-.1013-.1992a1.3114 1.3114 0 0 0-.218-.1074c-.1318-.046-.3369-.2635-.3093-.3248a2.3155 2.3155 0 0 0 .0337-.083c.0246-.0613-.2239-.1962-.4692-.2545-.2452-.0582-.2421-.0583-.1992-.1073.0215-.0276.0212-.1227.0028-.3005-.092-.84-.4321-1.4285-.9993-1.7259-.1226-.0644-.2299-.1288-.239-.1471-.0583-.089-.7818-.365-1.1803-.4477-.1257-.0245-.3744-.0857-.5522-.1378-.1778-.049-.4504-.1016-.6098-.12-.4568-.043-1.073-.147-1.2754-.2114-.1012-.0307-.3403-.0858-.5335-.1195-.1931-.0368-.3587-.0766-.368-.0919-.0122-.0184-.0858-.0156-.187.0028-.1164.0215-.2912.0217-.5671-.0028-.2177-.0215-.7573-.034-1.1957-.031-.6745.0031-.8585-.0057-1.2019-.0609-.2207-.0368-.518-.0646-.659-.0646-.3373-.0031-1.331-.1042-1.1531-.1196.0276 0 .1195-.0181.2053-.0365.141-.0307.1504-.0372.1228-.0985-.0306-.0644-.0458-.0673-.478-.0642-.368 0-.4539.0094-.4815.0492-.0306.0399-.0615.0428-.1964.0183-.144-.0306-.1533-.0368-.1073-.0736.049-.0368.0492-.046.0094-.0736-.0246-.0153-.0676-.031-.0952-.031-.0399 0-1.9562-.19-2.7533-.2727-.1564-.0184-.2941-.0365-.3033-.0488-.0092-.0092.0061-.0154.0337-.0154.0307 0 .052-.0124.052-.0277 0-.046-.156-.058-.3707-.0244-.1502.0215-.2303.0213-.2794-.0032-.0582-.0246-.0395-.0273.0924-.015.2912.0306.1683-.0401-.1383-.077-.1656-.0214-.3372-.043-.3801-.0491a.486.486 0 0 1-.1379-.046c-.0306-.0184-.3679-.0763-.748-.1284-.3802-.0521-.8065-.1291-.9506-.172-.4967-.141-.9532-.371-1.2169-.607l-.1382-.1224.0492-.1167c.1011-.2422.2299-.3832.4598-.4936.3158-.1533.46-.178 1.0762-.1964.561-.0122.693-.0365.6286-.1101-.0307-.043-.472-.1106-.6928-.1106-.138 0-.4815-.0674-.7973-.1594a1.2257 1.2257 0 0 0-.4003-.0488zm8.8497 2.9503a.3051.3051 0 0 0-.0675.0051c-.181.0307-.285.0734-.3769.15l-.0919.0736.1472.0033c.1564 0 .239-.0306.3525-.1317.0713-.0644.0838-.0963.0366-.1003zm5.7762.951c.0383-.0023.0814.0089.1626.0319.092.0276.193.0401.2236.031.0307-.0093.0674-.0033.0797.0182.0153.0276-.0305.0308-.1838.0155-.1349-.0154-.2025-.0126-.2025.0089 0 .0184.0368.04.0858.0492.2238.049.2607.0737.0675.0553-.1103-.0123-.276-.0213-.368-.0244-.1594 0-.1684.003-.1776.0797-.0092.0705-.0307.0856-.181.1163-.2053.0398-.1775.0428-.3308-.0277-.138-.0674-.4418-.141-.819-.1992-.141-.0215-.2112-.0396-.1621-.0427.0521 0 .3342.0307.6286.0736.5457.0767.6988.0919.6651.0582-.0092-.0092-.2483-.0644-.5334-.1196l-.5151-.1012.3004-.0033c.2637-.003.3098.0064.3895.0647.0675.049.1011.0583.1256.0337.0215-.0214.1133-.028.2574-.0187.1931.0153.2452.0095.3525-.0488.0628-.0322.0966-.0483.135-.0506zm-4.3466.5128c.0152-.0005.0284.0022.036.0099.0124.0092.0002.0306-.0243.0459-.0582.0368-.0828.037-.1073.0033-.0138-.0253.0499-.0575.0956-.059zm4.9869.09c.0057-.002.0158.0105.0342.0366.0214.0276.0673.052.098.052.049 0 .0524.006.0126.0305-.0245.0153-.0522.0276-.0614.0276-.0613-.0061-.0919-.0428-.0919-.098.0015-.0306.0027-.0468.0085-.0487zm-3.9515.1805c-.0613 0-.104.052-.104.1256 0 .0153.0702.0276.156.0276.1472 0 .1536-.003.1168-.052-.0613-.0797-.0983-.1012-.1688-.1012zm6.1901 1.8304c.0215-.0092.0738.012.1167.0426.0675.0521.0674.0584.0122.0553-.0858 0-.184-.0765-.1289-.098Z"
      fill="#888"
    />
  </svg>
);

const NormalityChart = ({
  scores,
  mu,
  sigma,
}: {
  scores: number[];
  mu: number;
  sigma: number;
}) => {
  const line = useMemo(
    () => buildNormalityLine(scores, { mu, sigma }),
    [scores, mu, sigma],
  );
  const width = 280;
  const height = 110;
  const paddingX = 10;
  const paddingY = 12;

  const scaleX = (value: number) =>
    paddingX + ((value - 1) / 9) * (width - paddingX * 2);
  const scaleY = (value: number) =>
    height - paddingY - value * (height - paddingY * 2);

  const userPath = line
    .map(
      (point, idx) =>
        `${idx === 0 ? "M" : "L"}${scaleX(point.x)},${scaleY(point.user)}`,
    )
    .join(" ");
  const idealPath = line
    .map(
      (point, idx) =>
        `${idx === 0 ? "M" : "L"}${scaleX(point.x)},${scaleY(point.ideal)}`,
    )
    .join(" ");

  const meanX = scaleX(mu);
  const meanDisplay = mu.toFixed(2);

  return (
    <svg
      className="normality-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Normality chart"
    >
      <path className="normality-ideal" d={idealPath} />
      <path className="normality-user" d={userPath} />
      <line
        className="normality-mean"
        x1={meanX}
        y1={paddingY}
        x2={meanX}
        y2={height - paddingY}
      />
      <text className="normality-mean-label" x={meanX} y={paddingY - 2}>
        {meanDisplay}
      </text>
      <line
        className="normality-axis"
        x1={paddingX}
        y1={height - paddingY}
        x2={width - paddingX}
        y2={height - paddingY}
      />
      <text className="normality-label" x={paddingX} y={height - 2}>
        1
      </text>
      <text className="normality-label" x={width / 2} y={height - 2}>
        5
      </text>
      <text className="normality-label" x={width - paddingX} y={height - 2}>
        10
      </text>
    </svg>
  );
};

const App = () => {
  const [hydrated, setHydrated] = useState(false);
  const [exportData, setExportData] = useState<AnimeListExport | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [shikimoriUsername, setShikimoriUsername] = useState("");
  const [shikimoriLoading, setShikimoriLoading] = useState(false);
  const [shikimoriProgress, setShikimoriProgress] = useState("");
  const [shikimoriError, setShikimoriError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [showPosters, setShowPosters] = useState(true);
  const [showEnglish, setShowEnglish] = useState(true);
  const [assumeDroppedLower, setAssumeDroppedLower] = useState(true);
  const [avoidRepeats, setAvoidRepeats] = useState(true);
  const [kFactor, setKFactor] = useState(32);
  const [comparisonsTarget, setComparisonsTarget] = useState(0);
  const [settingsConfirmed, setSettingsConfirmed] = useState(false);
  const [appliedSettings, setAppliedSettings] =
    useState<AppliedSettings | null>(null);
  const [appliedAnimeIds, setAppliedAnimeIds] = useState<number[]>([]);
  const [scoreMeanTarget, setScoreMeanTarget] = useState<number | null>(null);
  const [eloState, setEloState] = useState<EloState | null>(null);
  const [currentPair, setCurrentPair] = useState<[number, number] | null>(null);
  const [autoDecisions, setAutoDecisions] = useState(0);
  const [pairError, setPairError] = useState<string | null>(null);
  const [mediaCache, setMediaCache] = useState<Map<number, AnimeMedia | null>>(
    () => new Map(),
  );

  const rngRef = useRef(createRng(Date.now()));

  useEffect(() => {
    if (typeof window === "undefined") {
      setHydrated(true);
      return;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setHydrated(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as StoredState;
      if (!parsed || parsed.version !== 1) {
        setHydrated(true);
        return;
      }
      setExportData(parsed.exportData ?? null);
      setFileName(parsed.fileName ?? null);
      setStatusFilter(parsed.statusFilter ?? []);
      setShowPosters(parsed.showPosters ?? true);
      setShowEnglish(parsed.showEnglish ?? true);
      setAssumeDroppedLower(parsed.assumeDroppedLower ?? true);
      setAvoidRepeats(parsed.avoidRepeats ?? true);
      setKFactor(parsed.kFactor ?? 32);
      setComparisonsTarget(parsed.comparisonsTarget ?? 0);
      setSettingsConfirmed(parsed.settingsConfirmed ?? false);
      setAppliedSettings(parsed.appliedSettings ?? null);
      setAppliedAnimeIds(parsed.appliedAnimeIds ?? []);
      setScoreMeanTarget(parsed.scoreMeanTarget ?? null);
      setAutoDecisions(parsed.autoDecisions ?? 0);
      setCurrentPair(parsed.currentPair ?? null);
      setEloState(
        parsed.eloState ? deserializeEloState(parsed.eloState) : null,
      );
    } catch (err) {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  const animeById = useMemo(() => {
    const map = new Map<number, AnimeEntry>();
    exportData?.anime.forEach((entry) => map.set(entry.animeId, entry));
    return map;
  }, [exportData]);

  const statusById = useMemo(() => {
    const map = new Map<number, string | null>();
    exportData?.anime.forEach((entry) => map.set(entry.animeId, entry.status));
    return map;
  }, [exportData]);

  const allStatuses = useMemo(() => {
    const statuses = new Set<string>();
    exportData?.anime.forEach((entry) => {
      if (entry.status) {
        statuses.add(entry.status);
      }
    });
    return Array.from(statuses).sort();
  }, [exportData]);

  const selectedEntries = useMemo(() => {
    if (!exportData) {
      return [];
    }
    const allowed = new Set(statusFilter);
    return exportData.anime.filter(
      (entry) => entry.status && allowed.has(entry.status),
    );
  }, [exportData, statusFilter]);

  const selectedIds = useMemo(() => {
    return selectedEntries.map((entry) => entry.animeId);
  }, [selectedEntries]);

  const completedCount = useMemo(() => {
    return selectedEntries.filter((entry) => entry.status === "Completed")
      .length;
  }, [selectedEntries]);

  const droppedCount = useMemo(() => {
    return selectedEntries.filter((entry) => entry.status === "Dropped").length;
  }, [selectedEntries]);

  const totalPairs = (selectedIds.length * (selectedIds.length - 1)) / 2;
  const pairScale = useMemo(() => {
    if (totalPairs <= 0) {
      return 1;
    }
    if (!assumeDroppedLower || !completedCount || !droppedCount) {
      return 1;
    }
    const allowedPairs = totalPairs - completedCount * droppedCount;
    return allowedPairs / totalPairs;
  }, [assumeDroppedLower, completedCount, droppedCount, totalPairs]);

  const malSummary = useMemo(() => {
    return malScoreSummary(selectedEntries);
  }, [selectedEntries]);

  const normalityMultiplier = useMemo(() => {
    const value = 1.2 - 0.9 * malSummary.normality;
    return Math.max(0.35, Math.min(1.2, value));
  }, [malSummary.normality]);

  const comparisonScale = pairScale * normalityMultiplier;
  const guidance = useMemo(
    () => comparisonTargets(selectedIds.length, comparisonScale),
    [selectedIds.length, comparisonScale],
  );

  const sliderMax = guidance.excessive;
  const clampPct = (value: number) => {
    const denom = sliderMax || 1;
    return Math.max(0, Math.min(100, (value / denom) * 100));
  };
  const rangeMarkerStyle = (value: number) => {
    const pct = clampPct(value);
    let translate = "-50%";
    if (pct < 8) {
      translate = "0%";
    } else if (pct > 92) {
      translate = "-100%";
    }
    return { left: `${pct}%`, transform: `translateX(${translate})` };
  };
  const rangeMarks = useMemo(
    () => [
      { label: "min", value: guidance.meaningfulMin },
      { label: "optimal", value: guidance.optimal },
      { label: "excessive", value: guidance.excessive },
    ],
    [guidance.meaningfulMin, guidance.optimal, guidance.excessive],
  );
  const currentValueStyle = rangeMarkerStyle(comparisonsTarget);

  useEffect(() => {
    if (!exportData || settingsConfirmed) {
      return;
    }
    const next = Math.max(0, guidance.optimal);
    setComparisonsTarget(Math.min(next, sliderMax));
  }, [exportData, settingsConfirmed, guidance.optimal, sliderMax]);

  useEffect(() => {
    if (!exportData) {
      return;
    }
    setStatusFilter((prev) => {
      const filtered = prev.filter((status) => allStatuses.includes(status));
      if (filtered.length) {
        return filtered;
      }
      const defaults = allStatuses.filter(
        (status) => status !== "Plan to Watch" && status !== "Watching",
      );
      return defaults.length ? defaults : allStatuses;
    });
  }, [allStatuses, exportData]);

  const ensureMedia = useCallback(
    async (animeId: number) => {
      if (mediaCache.has(animeId)) {
        return;
      }
      const media = await fetchAnimeMedia(animeId);
      setMediaCache((prev) => {
        const next = new Map(prev);
        next.set(animeId, media);
        return next;
      });
    },
    [mediaCache],
  );

  useEffect(() => {
    if (!currentPair || (!showPosters && !showEnglish)) {
      return;
    }
    currentPair.forEach((animeId) => {
      void ensureMedia(animeId);
    });
  }, [currentPair, showPosters, showEnglish, ensureMedia]);

  const resetRankingState = useCallback(() => {
    setSettingsConfirmed(false);
    setAppliedSettings(null);
    setAppliedAnimeIds([]);
    setScoreMeanTarget(null);
    setEloState(null);
    setCurrentPair(null);
    setAutoDecisions(0);
    setPairError(null);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const exportResult = parseMalExport(new Uint8Array(buffer), file.name);
      setExportData(exportResult);
      setFileName(file.name);
      setShikimoriError(null);
      setMediaCache(new Map());
      rngRef.current = createRng(Date.now());
      resetRankingState();
    },
    [resetRankingState],
  );

  const handleShikimoriImport = useCallback(
    async (username: string) => {
      if (!username.trim()) {
        setShikimoriError("Please enter a username");
        return;
      }
      setShikimoriLoading(true);
      setShikimoriError(null);
      setShikimoriProgress("Connecting...");
      try {
        const result = await fetchShikimoriAnimeList(
          username.trim(),
          (loaded, status) => {
            setShikimoriProgress(`${status} (${loaded} anime)`);
          },
        );
        if (!result) {
          setShikimoriError("User not found or API error");
          return;
        }
        if (result.anime.length === 0) {
          setShikimoriError("No anime found in this user's list");
          return;
        }
        setExportData(result);
        setFileName(`shikimori:${result.userName}`);
        setMediaCache(new Map());
        rngRef.current = createRng(Date.now());
        resetRankingState();
      } catch (err) {
        setShikimoriError(
          err instanceof Error ? err.message : "Failed to fetch",
        );
      } finally {
        setShikimoriLoading(false);
        setShikimoriProgress("");
      }
    },
    [resetRankingState],
  );

  const startRanking = useCallback(() => {
    if (!selectedIds.length) {
      return;
    }
    const newElo = createEloState(selectedIds, kFactor);
    setEloState(newElo);
    setCurrentPair(null);
    setAutoDecisions(0);
    setPairError(null);
    setSettingsConfirmed(true);
    setAppliedAnimeIds([...selectedIds]);
    setAppliedSettings({
      comparisonsTarget,
      kFactor,
      avoidRepeats,
      assumeDroppedLower,
      statuses: [...statusFilter],
      malNormality: malSummary.normality,
      normalityMultiplier,
    });
  }, [
    selectedIds,
    kFactor,
    comparisonsTarget,
    avoidRepeats,
    assumeDroppedLower,
    statusFilter,
    malSummary.normality,
    normalityMultiplier,
  ]);

  const appliedAssumeDroppedLower =
    appliedSettings?.assumeDroppedLower ?? assumeDroppedLower;
  const appliedAvoidRepeats = appliedSettings?.avoidRepeats ?? avoidRepeats;
  const appliedKFactor = appliedSettings?.kFactor ?? kFactor;
  const appliedStatuses = appliedSettings?.statuses ?? statusFilter;
  const appliedMalNormality =
    appliedSettings?.malNormality ?? malSummary.normality;
  const appliedNormalityMultiplier =
    appliedSettings?.normalityMultiplier ?? normalityMultiplier;

  const comparisonGoal =
    appliedSettings?.comparisonsTarget ?? comparisonsTarget;
  const done = Boolean(eloState && eloState.comparisons >= comparisonGoal);
  const inCombat = Boolean(settingsConfirmed && eloState && !done);
  const progressValue =
    !eloState || comparisonGoal <= 0
      ? 1
      : Math.min(1, eloState.comparisons / comparisonGoal);

  const activeAnimeIds = useMemo(
    () => (appliedAnimeIds.length ? appliedAnimeIds : selectedIds),
    [appliedAnimeIds, selectedIds],
  );

  const activeEntries = useMemo(() => {
    return activeAnimeIds
      .map((id) => animeById.get(id))
      .filter((entry): entry is AnimeEntry => Boolean(entry));
  }, [activeAnimeIds, animeById]);

  const malScoreMean = useMemo(() => {
    const scores = activeEntries
      .map((entry) => entry.myScore)
      .filter((score): score is number => Boolean(score && score > 0));
    if (!scores.length) {
      return 5.5;
    }
    return scores.reduce((sum, value) => sum + value, 0) / scores.length;
  }, [activeEntries]);

  useEffect(() => {
    if (!done || scoreMeanTarget !== null) {
      return;
    }
    setScoreMeanTarget(Number(malScoreMean.toFixed(2)));
  }, [done, scoreMeanTarget, malScoreMean]);

  const priorityData = useMemo(() => {
    const scoreById = new Map<number, number | null>();
    const scores: number[] = [];
    let completedCount = 0;
    let droppedCount = 0;

    activeEntries.forEach((entry) => {
      scoreById.set(entry.animeId, entry.myScore ?? null);
      if (entry.myScore && entry.myScore > 0) {
        scores.push(entry.myScore);
      }
      if (entry.status === "Completed") {
        completedCount += 1;
      } else if (entry.status === "Dropped") {
        droppedCount += 1;
      }
    });

    const priorityById = new Map<number, number>();
    if (!scores.length) {
      activeEntries.forEach((entry) => priorityById.set(entry.animeId, 0));
      return {
        scoreById,
        priorityById,
        priorityBoost: 0,
        sameScoreBoost: 0,
      };
    }

    const fit = fitNormal(scores);
    const total = scores.length;
    const observed = Array.from({ length: 10 }, (_, idx) => {
      const score = idx + 1;
      return scores.filter((s) => s === score).length / total;
    });

    let expected = Array.from({ length: 10 }, () => 0);
    if (fit.sigma > 0) {
      expected = Array.from({ length: 10 }, (_, idx) => {
        const score = idx + 1;
        const low = score - 0.5;
        const high = score + 0.5;
        return (
          normalCdf((high - fit.mu) / fit.sigma) -
          normalCdf((low - fit.mu) / fit.sigma)
        );
      });
    }

    const deviations = observed.map((value, idx) =>
      Math.max(0, value - expected[idx]),
    );
    const maxDeviation = Math.max(...deviations, 0);
    const priorityByScore = deviations.map((value) =>
      maxDeviation > 0 ? value / maxDeviation : 0,
    );

    activeEntries.forEach((entry) => {
      const score = entry.myScore ?? 0;
      const priority = score ? priorityByScore[score - 1] : 0;
      priorityById.set(entry.animeId, priority);
    });

    let normality = 0.5;
    if (scores.length < 10) {
      normality = fit.sigma <= 0 ? 0 : 0.5;
    } else if (fit.sigma <= 0) {
      normality = 0;
    } else {
      const l1 = observed.reduce(
        (sum, value, idx) => sum + Math.abs(value - expected[idx]),
        0,
      );
      normality = Math.max(0, Math.min(1, 1 - l1 / 2));
    }

    const n = activeEntries.length;
    const totalPairs = (n * (n - 1)) / 2;
    let pairScale = 1;
    if (
      totalPairs > 0 &&
      appliedAssumeDroppedLower &&
      completedCount &&
      droppedCount
    ) {
      const allowedPairs = totalPairs - completedCount * droppedCount;
      pairScale = allowedPairs / totalPairs;
    }
    const normalityMultiplier = Math.max(
      0.35,
      Math.min(1.2, 1.2 - 0.9 * normality),
    );
    const comparisonScale = pairScale * normalityMultiplier;
    const priorityGuidance = comparisonTargets(n, comparisonScale);
    const optimal = Math.max(1, priorityGuidance.optimal);
    const target = Math.max(1, comparisonGoal);
    const scarcity = Math.min(2.5, optimal / target);
    const normalityGap = 1 - normality;
    const priorityBoost = Math.min(
      2.5,
      Math.max(0, (scarcity - 1) * 1.2 + normalityGap),
    );

    return {
      scoreById,
      priorityById,
      priorityBoost,
      sameScoreBoost: priorityBoost * 0.75,
    };
  }, [activeEntries, appliedAssumeDroppedLower, comparisonGoal]);

  const pairAllowed = useCallback(
    (aId: number, bId: number, assumeLower: boolean) => {
      if (!assumeLower) {
        return true;
      }
      const aStatus = statusById.get(aId);
      const bStatus = statusById.get(bId);
      return !(
        (aStatus === "Completed" && bStatus === "Dropped") ||
        (aStatus === "Dropped" && bStatus === "Completed")
      );
    },
    [statusById],
  );

  const selectAllowedPair = useCallback(
    (
      elo: EloState,
      animeIds: number[],
      avoid: boolean,
      assumeLower: boolean,
    ): [number, number] | null => {
      for (let attempt = 0; attempt < 250; attempt += 1) {
        const [aId, bId] = selectPair(elo, animeIds, {
          rng: rngRef.current,
          avoidRepeats: avoid,
          priorityById: priorityData.priorityById,
          priorityBoost: priorityData.priorityBoost,
          scoreById: priorityData.scoreById,
          sameScoreBoost: priorityData.sameScoreBoost,
        });
        if (pairAllowed(aId, bId, assumeLower)) {
          return [aId, bId];
        }
      }

      const allowed: [number, number][] = [];
      for (let i = 0; i < animeIds.length; i += 1) {
        for (let j = i + 1; j < animeIds.length; j += 1) {
          if (pairAllowed(animeIds[i], animeIds[j], assumeLower)) {
            allowed.push([animeIds[i], animeIds[j]]);
          }
        }
      }
      if (!allowed.length) {
        return null;
      }
      const idx = Math.floor(rngRef.current.nextFloat() * allowed.length);
      return allowed[idx];
    },
    [pairAllowed, priorityData],
  );

  useEffect(() => {
    if (
      !settingsConfirmed ||
      !eloState ||
      currentPair ||
      !appliedAnimeIds.length
    ) {
      return;
    }
    const pair = selectAllowedPair(
      eloState,
      appliedAnimeIds,
      appliedSettings?.avoidRepeats ?? avoidRepeats,
      appliedSettings?.assumeDroppedLower ?? assumeDroppedLower,
    );
    if (!pair) {
      setPairError("No valid pairs available with current assumptions.");
      return;
    }
    setCurrentPair(pair);
  }, [
    settingsConfirmed,
    eloState,
    currentPair,
    appliedAnimeIds,
    avoidRepeats,
    assumeDroppedLower,
    appliedSettings,
    selectAllowedPair,
  ]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!exportData) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: StoredState = {
      version: 1,
      exportData,
      fileName,
      statusFilter,
      showPosters,
      showEnglish,
      assumeDroppedLower,
      avoidRepeats,
      kFactor,
      comparisonsTarget,
      settingsConfirmed,
      appliedSettings,
      appliedAnimeIds,
      scoreMeanTarget,
      autoDecisions,
      currentPair,
      eloState: eloState ? serializeEloState(eloState) : null,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [
    hydrated,
    exportData,
    fileName,
    statusFilter,
    showPosters,
    showEnglish,
    assumeDroppedLower,
    avoidRepeats,
    kFactor,
    comparisonsTarget,
    settingsConfirmed,
    appliedSettings,
    appliedAnimeIds,
    scoreMeanTarget,
    autoDecisions,
    currentPair,
    eloState,
  ]);

  const currentPairEntries = useMemo(() => {
    if (!currentPair || !exportData) {
      return null;
    }
    return currentPair.map((id) => animeById.get(id) as AnimeEntry);
  }, [currentPair, exportData, animeById]);

  const skipDecision = useMemo<SkipDecision | null>(() => {
    if (!currentPairEntries) {
      return null;
    }
    const [left, right] = currentPairEntries;
    const leftStatus = left.status ?? "";
    const rightStatus = right.status ?? "";
    const leftScore = left.myScore ?? 0;
    const rightScore = right.myScore ?? 0;
    if (leftStatus === rightStatus && leftScore === rightScore) {
      return null;
    }
    if (leftScore !== rightScore) {
      return {
        outcome: leftScore > rightScore ? 1 : 0,
        reason: "Higher score wins",
      };
    }
    return { outcome: 0.5, reason: "Same score" };
  }, [currentPairEntries]);

  const applyOutcome = useCallback(
    (outcome: number) => {
      if (!eloState || !currentPair) {
        return;
      }
      const updated = recordOutcome(
        eloState,
        currentPair[0],
        currentPair[1],
        outcome,
      );
      const pair = selectAllowedPair(
        updated,
        appliedAnimeIds,
        appliedAvoidRepeats,
        appliedAssumeDroppedLower,
      );
      setEloState(updated);
      if (!pair) {
        setCurrentPair(null);
        setPairError("No valid pairs available with current assumptions.");
        return;
      }
      setCurrentPair(pair);
    },
    [
      eloState,
      currentPair,
      appliedAnimeIds,
      appliedAvoidRepeats,
      appliedAssumeDroppedLower,
      selectAllowedPair,
    ],
  );

  const applyAutoSkip = useCallback(() => {
    if (!skipDecision) {
      return;
    }
    setAutoDecisions((prev) => prev + 1);
    applyOutcome(skipDecision.outcome);
  }, [skipDecision, applyOutcome]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!currentPair || done) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        applyOutcome(1);
      } else if (key === "d") {
        event.preventDefault();
        applyOutcome(0);
      } else if (key === "s") {
        if (skipDecision) {
          event.preventDefault();
          applyAutoSkip();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPair, done, applyOutcome, skipDecision, applyAutoSkip]);

  const topRows = useMemo(() => {
    if (!eloState) {
      return [];
    }
    const statusTier = appliedAssumeDroppedLower ? { Dropped: -1 } : undefined;
    const rows = Array.from(eloState.ratings.entries()).sort((left, right) => {
      const [leftId, leftRating] = left;
      const [rightId, rightRating] = right;
      const leftStatus = animeById.get(leftId)?.status || "";
      const rightStatus = animeById.get(rightId)?.status || "";
      const leftTier = statusTier ? (statusTier[leftStatus] ?? 0) : 0;
      const rightTier = statusTier ? (statusTier[rightStatus] ?? 0) : 0;
      if (leftTier !== rightTier) {
        return rightTier - leftTier;
      }
      return rightRating.value - leftRating.value;
    });
    return rows.slice(0, 15).map(([animeId, rating]) => {
      const entry = animeById.get(animeId) as AnimeEntry;
      return {
        title: entry.title,
        elo: rating.value,
        games: rating.games,
        wins: rating.wins,
        losses: rating.losses,
        ties: rating.ties,
      };
    });
  }, [eloState, animeById, appliedAssumeDroppedLower]);

  const finalFit = useMemo(() => {
    if (!eloState) {
      return null;
    }
    return fitNormal(Array.from(eloState.ratings.values()).map((r) => r.value));
  }, [eloState]);

  const basePercentiles = useMemo(() => {
    if (!eloState || !finalFit) {
      return [];
    }
    return Array.from(eloState.ratings.values()).map((rating) =>
      percentile(rating.value, finalFit),
    );
  }, [eloState, finalFit]);

  const scoreMeanValue = scoreMeanTarget ?? Number(malScoreMean.toFixed(2));

  const percentileShift = useMemo(() => {
    if (!basePercentiles.length) {
      return 0;
    }
    const target = Math.max(1, Math.min(10, scoreMeanValue));
    const meanForShift = (shift: number) => {
      const total = basePercentiles.reduce((sum, value) => {
        const adjusted = Math.min(1, Math.max(0, value + shift));
        return sum + score10FromPercentile(adjusted);
      }, 0);
      return total / basePercentiles.length;
    };
    let low = -1;
    let high = 1;
    let bestShift = 0;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 30; i += 1) {
      const mid = (low + high) / 2;
      const mean = meanForShift(mid);
      const diff = mean - target;
      const absDiff = Math.abs(diff);
      if (absDiff < bestDiff) {
        bestDiff = absDiff;
        bestShift = mid;
      }
      if (diff < 0) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return bestShift;
  }, [basePercentiles, scoreMeanValue]);

  const appliedExcessive = useMemo(() => {
    const n = activeAnimeIds.length;
    if (n <= 0) return 1;
    const totalPairs = (n * (n - 1)) / 2;
    let pairScale = 1;
    if (totalPairs > 0 && appliedAssumeDroppedLower) {
      const completed = activeEntries.filter(
        (e) => e.status === "Completed",
      ).length;
      const dropped = activeEntries.filter(
        (e) => e.status === "Dropped",
      ).length;
      if (completed && dropped) {
        const allowedPairs = totalPairs - completed * dropped;
        pairScale = allowedPairs / totalPairs;
      }
    }
    const normMult = Math.max(
      0.35,
      Math.min(1.2, 1.2 - 0.9 * appliedMalNormality),
    );
    const scale = pairScale * normMult;
    return comparisonTargets(n, scale).excessive;
  }, [
    activeAnimeIds.length,
    activeEntries,
    appliedAssumeDroppedLower,
    appliedMalNormality,
  ]);

  const excessiveRatio = useMemo(() => {
    if (!eloState || appliedExcessive <= 0) return 0;
    return Math.min(1, eloState.comparisons / appliedExcessive);
  }, [eloState, appliedExcessive]);

  const blendingParams = useMemo<BlendingParams | undefined>(() => {
    if (!malSummary || !eloState) {
      return undefined;
    }
    return {
      malNormality: appliedMalNormality,
      completionRatio: excessiveRatio,
      malFit: malSummary.fit,
      totalComparisons: eloState.comparisons,
      itemCount: activeAnimeIds.length,
    };
  }, [
    appliedMalNormality,
    excessiveRatio,
    malSummary,
    eloState,
    activeAnimeIds.length,
  ]);

  const results = useMemo<AnimeResult[] | null>(() => {
    if (!eloState || !finalFit) {
      return null;
    }
    const statusTier = appliedAssumeDroppedLower ? { Dropped: -1 } : undefined;
    return buildResults(
      animeById,
      eloState,
      finalFit,
      statusTier,
      percentileShift,
      blendingParams,
    );
  }, [
    eloState,
    finalFit,
    animeById,
    appliedAssumeDroppedLower,
    percentileShift,
    blendingParams,
  ]);

  const eloWeight = computeEloWeight(excessiveRatio, appliedMalNormality);

  const resultsMetadata = useMemo(() => {
    if (!exportData || !eloState || !finalFit) {
      return null;
    }
    const statusTier = appliedAssumeDroppedLower ? { Dropped: -1 } : null;
    return {
      user_name: exportData.userName,
      user_id: exportData.userId,
      source_filename: fileName,
      included_statuses: appliedStatuses,
      comparisons: eloState.comparisons,
      skipped: eloState.skips,
      elo_k_factor: appliedKFactor,
      elo_initial_rating: 1500,
      normal_fit_mu: finalFit.mu,
      normal_fit_sigma: finalFit.sigma,
      score_mean_target: scoreMeanValue,
      percentile_shift: percentileShift,
      assume_dropped_lower: appliedAssumeDroppedLower,
      status_tier: statusTier,
      mal_score_normality: appliedMalNormality,
      normality_multiplier: appliedNormalityMultiplier,
      elo_weight: eloWeight,
      mal_weight: 1 - eloWeight,
    };
  }, [
    exportData,
    eloState,
    finalFit,
    fileName,
    appliedStatuses,
    appliedKFactor,
    scoreMeanValue,
    percentileShift,
    appliedAssumeDroppedLower,
    appliedMalNormality,
    appliedNormalityMultiplier,
    eloWeight,
  ]);

  const handleSaveToDisk = useCallback(async () => {
    if (!results || !resultsMetadata) {
      return;
    }
    if (!window.showDirectoryPicker) {
      alert(
        "Directory access is not supported in this browser. Use downloads instead.",
      );
      return;
    }
    const base = safeBaseName(`anime_ranker_${exportData?.userName || "user"}`);
    const dir = await window.showDirectoryPicker();
    const csvHandle = await dir.getFileHandle(`${base}.csv`, { create: true });
    const jsonHandle = await dir.getFileHandle(`${base}.json`, {
      create: true,
    });

    const csvWritable = await csvHandle.createWritable();
    await csvWritable.write(resultsToCsv(results));
    await csvWritable.close();

    const jsonWritable = await jsonHandle.createWritable();
    await jsonWritable.write(resultsToJson(resultsMetadata, results));
    await jsonWritable.close();
  }, [results, resultsMetadata, exportData]);

  const leftEntry = currentPairEntries?.[0];
  const rightEntry = currentPairEntries?.[1];
  const leftMedia = leftEntry ? mediaCache.get(leftEntry.animeId) : null;
  const rightMedia = rightEntry ? mediaCache.get(rightEntry.animeId) : null;

  const hero = (
    <header className="hero">
      <div>
        <p className="eyebrow">Elo Anime Ranker</p>
        <h1>Rank your anime with pairwise comparisons</h1>
        <p className="lede">
          Import from MAL or Shikimori, smash hotkeys, and let Elo build a
          balanced ranking in minutes.
        </p>
      </div>
    </header>
  );

  return (
    <div className="app">
      {!inCombat && hero}

      <div className="layout">
        <aside className="sidebar">
          <div className="panel">
            <h2>Session setup</h2>
            <div className="import-tabs">
              <div className="import-section">
                <p className="section-title">
                  <MalIcon />
                  MyAnimeList export
                </p>
                <label className="upload">
                  <input
                    type="file"
                    accept=".xml,.gz"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleFile(file);
                      }
                    }}
                  />
                  <span>Upload file</span>
                  <em>XML or XML.GZ</em>
                </label>
                <a
                  href="https://myanimelist.net/panel.php?go=export"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="export-link"
                >
                  Get your export →
                </a>
              </div>
              <div className="import-divider">or</div>
              <div className="import-section">
                <p className="section-title">
                  <ShikimoriIcon />
                  Shikimori
                </p>
                <form
                  className="shikimori-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleShikimoriImport(shikimoriUsername);
                  }}
                >
                  <input
                    type="text"
                    placeholder="Username"
                    value={shikimoriUsername}
                    onChange={(e) => setShikimoriUsername(e.target.value)}
                    disabled={shikimoriLoading}
                  />
                  <button type="submit" disabled={shikimoriLoading}>
                    {shikimoriLoading ? "..." : "Fetch"}
                  </button>
                </form>
                {shikimoriProgress && (
                  <em className="progress-text">{shikimoriProgress}</em>
                )}
                {shikimoriError && (
                  <em className="error-text">{shikimoriError}</em>
                )}
              </div>
            </div>
            {exportData && (
              <div className="user-meta">
                <span className="source-badge">
                  {exportData.source === "shikimori" ? "Shikimori" : "MAL"}
                </span>
                <span>
                  <strong>{exportData.userName || "unknown"}</strong>
                </span>
                <span>{exportData.anime.length} anime</span>
                <span>
                  <strong>{selectedEntries.length}</strong> eligible
                </span>
              </div>
            )}
            {!exportData && (
              <p className="muted">
                Upload a MAL export or enter your Shikimori username to begin.
              </p>
            )}
            {exportData && (
              <>
                {selectedEntries.length < 2 && (
                  <p className="warning">
                    Select at least 2 anime (adjust status filters).
                  </p>
                )}

                <div className="section">
                  <p className="section-title">Comparisons target</p>
                  <div className="range-meta">
                    <span className="range-current" style={currentValueStyle}>
                      {comparisonsTarget}
                    </span>
                    <span className="range-max">{sliderMax}</span>
                  </div>
                  <input
                    type="range"
                    className="range-input"
                    min={0}
                    max={sliderMax}
                    value={Math.min(comparisonsTarget, sliderMax)}
                    onChange={(event) =>
                      setComparisonsTarget(Number(event.target.value))
                    }
                  />
                  <div className="range-marks">
                    {rangeMarks.map((mark) => (
                      <div
                        key={mark.label}
                        className="range-mark"
                        style={rangeMarkerStyle(mark.value)}
                      >
                        <span className="range-mark-line" />
                        <span className="range-mark-label">{mark.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="section">
                  <p className="section-title">Score shape</p>
                  <div className="slider-readonly">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(malSummary.normality * 100)}
                      disabled
                    />
                    <span>{Math.round(malSummary.normality * 100)}%</span>
                  </div>
                  <NormalityChart
                    scores={malSummary.scores}
                    mu={malSummary.fit.mu}
                    sigma={malSummary.fit.sigma}
                  />
                </div>

                <button
                  className="primary start-button"
                  onClick={startRanking}
                  disabled={selectedEntries.length < 2}
                >
                  {settingsConfirmed ? "Reset ranking" : "Start ranking"}
                </button>

                <details className="section">
                  <summary>Advanced</summary>
                  <div className="advanced">
                    <p className="section-title">Filters</p>
                    <div className="checkbox-grid">
                      {allStatuses.map((status) => (
                        <label key={status} className="checkbox">
                          <input
                            type="checkbox"
                            checked={statusFilter.includes(status)}
                            onChange={(event) => {
                              setStatusFilter((prev) => {
                                const set = new Set(prev);
                                if (event.target.checked) {
                                  set.add(status);
                                } else {
                                  set.delete(status);
                                }
                                return Array.from(set);
                              });
                            }}
                          />
                          <span>{status}</span>
                        </label>
                      ))}
                    </div>
                    <p className="section-title">Visual aids</p>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={showPosters}
                        onChange={(event) =>
                          setShowPosters(event.target.checked)
                        }
                      />
                      <span>Show posters (Jikan)</span>
                    </label>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={showEnglish}
                        onChange={(event) =>
                          setShowEnglish(event.target.checked)
                        }
                      />
                      <span>Show English titles</span>
                    </label>
                    <p className="section-title">Assumptions</p>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={assumeDroppedLower}
                        onChange={(event) =>
                          setAssumeDroppedLower(event.target.checked)
                        }
                      />
                      <span>Dropped is worse than Completed</span>
                    </label>
                    <p className="section-title">Behavior</p>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={avoidRepeats}
                        onChange={(event) =>
                          setAvoidRepeats(event.target.checked)
                        }
                      />
                      <span>Avoid repeating the same pair</span>
                    </label>
                    <p className="section-title">Elo</p>
                    <label className="slider">
                      <span>K-factor: {kFactor.toFixed(0)}</span>
                      <input
                        type="range"
                        min={1}
                        max={200}
                        step={1}
                        value={kFactor}
                        onChange={(event) =>
                          setKFactor(Number(event.target.value))
                        }
                      />
                    </label>
                  </div>
                </details>
              </>
            )}
          </div>
        </aside>

        <main className="main">
          {!exportData && (
            <div className="panel empty">
              <p>Import your anime list to unlock the ranking flow.</p>
            </div>
          )}
          {exportData && !settingsConfirmed && (
            <div className="panel">
              <h2>Ready when you are</h2>
              <p>
                Choose settings in the sidebar, then click Start ranking to
                apply.
              </p>
            </div>
          )}
          {exportData && settingsConfirmed && !eloState && (
            <div className="panel">
              <p>Ranking not initialized. Click Start ranking.</p>
            </div>
          )}
          {exportData && settingsConfirmed && eloState && (
            <div className="stack">
              {pairError && <div className="panel error">{pairError}</div>}

              {!done && currentPairEntries && (
                <div className="panel compare">
                  <h2>What&apos;s cooler?</h2>
                  <div className="compare-grid">
                    {[leftEntry, rightEntry].map((entry, idx) => {
                      if (!entry) {
                        return null;
                      }
                      const media = idx === 0 ? leftMedia : rightMedia;
                      const key = idx === 0 ? "left" : "right";
                      return (
                        <div key={key} className="compare-card">
                          {showPosters && media?.imageUrl && (
                            <img src={media.imageUrl} alt="" />
                          )}
                          <button
                            className="vote"
                            onClick={() => applyOutcome(idx === 0 ? 1 : 0)}
                          >
                            [{idx === 0 ? "A" : "D"}] {entry.title}
                          </button>
                          <div className="meta">
                            {showEnglish && media?.titleEnglish && (
                              <span>EN: {media.titleEnglish}</span>
                            )}
                            {entry.status && <span>{entry.status}</span>}
                            <span>Score {entry.myScore ?? "-"}/10</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="actions">
                    <button
                      className="secondary"
                      onClick={applyAutoSkip}
                      disabled={!skipDecision}
                      title={
                        skipDecision
                          ? skipDecision.reason
                          : "Auto-decide from score (disabled only when status and score match)."
                      }
                    >
                      [S] Skip (use score)
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        if (appliedSettings) {
                          setAppliedSettings({
                            ...appliedSettings,
                            comparisonsTarget: eloState.comparisons,
                          });
                        }
                        setComparisonsTarget(eloState.comparisons);
                      }}
                    >
                      Finish now
                    </button>
                  </div>
                </div>
              )}

              <div className="panel">
                <div className="progress-row">
                  <progress value={progressValue} max={1} />
                  <span>
                    Comparisons: {eloState.comparisons} / {comparisonGoal}
                  </span>
                </div>
              </div>

              {!done && topRows.length > 0 && (
                <div className="panel">
                  <h2>Current top 15</h2>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Elo</th>
                        <th>Games</th>
                        <th>W</th>
                        <th>L</th>
                        <th>T</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRows.map((row) => (
                        <tr key={row.title}>
                          <td>{row.title}</td>
                          <td>{row.elo.toFixed(1)}</td>
                          <td>{row.games}</td>
                          <td>{row.wins}</td>
                          <td>{row.losses}</td>
                          <td>{row.ties}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="hint">
                    Reach the comparison target to compute the 1-10 scores and
                    export.
                  </p>
                </div>
              )}

              {done && results && resultsMetadata && finalFit && (
                <div className="panel">
                  <h2>Elo to fitted Normal to 1-10</h2>
                  <div
                    className="scoring-math"
                    ref={(el) => {
                      if (el && window.MathJax?.typesetPromise) {
                        window.MathJax.typesetPromise([el]);
                      }
                    }}
                  >
                    <p className="math-line">
                      {"$\\mathcal{N}(\\mu=" +
                        finalFit.mu.toFixed(1) +
                        ",\\, \\sigma=" +
                        finalFit.sigma.toFixed(1) +
                        ") \\cdot " +
                        Math.round(eloWeight * 100) +
                        "\\%\\text{ Elo} + " +
                        Math.round((1 - eloWeight) * 100) +
                        "\\%\\text{ orig}" +
                        (excessiveRatio < 1
                          ? " \\cdot " +
                            (eloState?.comparisons ?? 0) +
                            "/" +
                            appliedExcessive +
                            "\\text{ comparisons}"
                          : "") +
                        "$"}
                    </p>
                    <p className="hint math-explain">
                      Fewer comparisons or better score distribution → trust
                      original scores more. Items with more games have more
                      reliable Elo ratings.
                    </p>
                    <div className="math-grid">
                      <div className="math-item">
                        <span className="math-label">Global weight</span>
                        <span>{"$w = r^{1+(1-n)}$"}</span>
                      </div>
                      <div className="math-item">
                        <span className="math-label">Item confidence</span>
                        <span>{"$c_i = 1 - e^{-g_i/\\bar{g}}$"}</span>
                      </div>
                      <div className="math-item">
                        <span className="math-label">Blend</span>
                        <span>
                          {
                            "$p = w c_i \\cdot p_{\\text{elo}} + (1 - w c_i) \\cdot p_{\\text{mal}}$"
                          }
                        </span>
                      </div>
                      <div className="math-item">
                        <span className="math-label">Score</span>
                        <span>{"$\\lceil 10p \\rceil$"}</span>
                      </div>
                    </div>
                    <div className="bell-curve-container">
                      {(() => {
                        const sorted = [...results].sort(
                          (a, b) => a.percentile - b.percentile,
                        );
                        const worst = sorted[0];
                        const best = sorted[sorted.length - 1];
                        const midIdx = Math.floor(sorted.length / 2);
                        const middle = sorted[midIdx];
                        type Sample = (typeof results)[0] & { color: string };
                        const samples: Sample[] = [
                          { ...worst, color: "#c44" },
                          { ...middle, color: "#888" },
                          { ...best, color: "#4a4" },
                        ];
                        const width = 260;
                        const height = 80;
                        const pad = { l: 25, r: 10, t: 25, b: 18 };
                        const chartW = width - pad.l - pad.r;
                        const chartH = height - pad.t - pad.b;
                        // X axis is score 1-10
                        const scaleX = (score: number) =>
                          pad.l + ((score - 1) / 9) * chartW;
                        // Bell curve centered at target mean
                        const targetMean = scoreMeanValue;
                        const spread = 2.5; // standard deviation in score units
                        const gaussian = (score: number) => {
                          const z = (score - targetMean) / spread;
                          return Math.exp(-0.5 * z * z);
                        };
                        const scaleY = (g: number) => pad.t + (1 - g) * chartH;
                        const steps = 50;
                        const pathPoints = Array.from(
                          { length: steps + 1 },
                          (_, i) => {
                            const score = 1 + (i / steps) * 9;
                            return `${i === 0 ? "M" : "L"}${scaleX(score).toFixed(1)},${scaleY(gaussian(score)).toFixed(1)}`;
                          },
                        ).join(" ");
                        const scoreTicks = [1, 5, 10];
                        return (
                          <svg
                            className="elo-bell-curve"
                            viewBox={`0 0 ${width} ${height}`}
                          >
                            <path className="bell-path" d={pathPoints} />
                            <line
                              className="bell-axis"
                              x1={pad.l}
                              y1={scaleY(0)}
                              x2={width - pad.r}
                              y2={scaleY(0)}
                            />
                            {scoreTicks.map((score) => {
                              const x = pad.l + ((score - 1) / 9) * chartW;
                              return (
                                <text
                                  key={score}
                                  className="bell-tick"
                                  x={x}
                                  y={height - 2}
                                >
                                  {score}
                                </text>
                              );
                            })}
                            {(() => {
                              // Calculate positions first to detect overlaps
                              const positions = samples.map((s) => {
                                const sampleScore = s.score1to10;
                                const x = Math.max(
                                  pad.l + 5,
                                  Math.min(
                                    width - pad.r - 5,
                                    scaleX(sampleScore),
                                  ),
                                );
                                const y = scaleY(gaussian(sampleScore));
                                return { ...s, x, y };
                              });
                              // Assign label offsets to avoid overlap
                              const labelYOffsets = positions.map((p, i) => {
                                let offset = -6;
                                for (let j = 0; j < i; j++) {
                                  if (Math.abs(positions[j].x - p.x) < 40) {
                                    offset -= 12;
                                  }
                                }
                                return offset;
                              });
                              return positions.map((s, idx) => {
                                const shortTitle =
                                  s.title.length > 8
                                    ? s.title.slice(0, 7) + "…"
                                    : s.title;
                                return (
                                  <g key={s.animeId}>
                                    <circle
                                      cx={s.x}
                                      cy={s.y}
                                      r={3}
                                      fill={s.color}
                                    />
                                    <text
                                      x={s.x}
                                      y={s.y + labelYOffsets[idx]}
                                      className="bell-sample"
                                      fill={s.color}
                                    >
                                      {shortTitle}
                                    </text>
                                  </g>
                                );
                              });
                            })()}
                          </svg>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="mean-control">
                    <div className="mean-header">
                      <span>Target mean for final scores</span>
                      <strong>{scoreMeanValue.toFixed(2)}</strong>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={0.01}
                      value={scoreMeanValue}
                      onChange={(event) =>
                        setScoreMeanTarget(Number(event.target.value))
                      }
                    />
                  </div>
                  <div className="results-actions">
                    <button
                      className="primary"
                      onClick={() =>
                        downloadBlob(
                          "anime_ranker_results.csv",
                          resultsToCsv(results),
                          "text/csv",
                        )
                      }
                    >
                      Download CSV
                    </button>
                    <button
                      className="primary"
                      onClick={() =>
                        downloadBlob(
                          "anime_ranker_results.json",
                          resultsToJson(resultsMetadata, results),
                          "application/json",
                        )
                      }
                    >
                      Download JSON
                    </button>
                    <button className="secondary" onClick={handleSaveToDisk}>
                      Save to disk
                    </button>
                  </div>
                  <table className="data-table results">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Title</th>
                        <th>Status</th>
                        <th>Original</th>
                        <th>Elo</th>
                        <th>Games</th>
                        <th>Percentile</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row) => (
                        <tr key={row.animeId}>
                          <td>{row.rank}</td>
                          <td>{row.title}</td>
                          <td>{row.status ?? "-"}</td>
                          <td>{row.myScore ?? "-"}</td>
                          <td>{row.elo.toFixed(1)}</td>
                          <td>{row.games}</td>
                          <td>{row.percentile.toFixed(4)}</td>
                          <td>{row.score1to10}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
