import { readFileSync } from 'fs';
import { join } from 'path';

describe('Markdown Rendering in Step Summary', () => {
    test('should have blank lines between </details> and ## headings in mermaid-generator.js', () => {
        const filePath = join(process.cwd(), 'src/mermaid-generator.js');
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        // Find all lines with writeToStepSummary('</details>')
        const detailsLines = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes("writeToStepSummary('</details>')")) {
                detailsLines.push(i);
            }
        }

        expect(detailsLines.length).toBeGreaterThan(0);

        // For each </details> line, check if there's a proper blank line before the next ## heading
        for (const lineIndex of detailsLines) {
            let foundHeading = false;
            let hasBlankLine = false;
            
            // Look ahead for the next ## heading
            for (let j = lineIndex + 1; j < Math.min(lineIndex + 10, lines.length); j++) {
                const line = lines[j].trim();
                
                // Check if we found a writeToStepSummary with ## heading
                if (line.includes("writeToStepSummary('##")) {
                    foundHeading = true;
                    
                    // Check if there's a blank line (empty writeToStepSummary) before the heading
                    for (let k = lineIndex + 1; k < j; k++) {
                        if (lines[k].includes("writeToStepSummary('')")) {
                            hasBlankLine = true;
                            break;
                        }
                    }
                    break;
                }
            }
            
            // If we found a heading after </details>, there should be a blank line
            if (foundHeading) {
                expect(hasBlankLine).toBe(true);
            }
        }
    });
});