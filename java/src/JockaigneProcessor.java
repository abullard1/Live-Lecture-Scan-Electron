import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import jargon.Charact;
import jargon.Script;
import jenesis.Legacy.Distance;
import jenesis.Legacy.Diversity;
import jenesis.Legacy.Similitude;
import jenesis.Mathx;
import jenesis.Nexus.DataNote;

/**
 * Reads OCR text from STDIN, runs it through the Jockaigne driven cleaning pipeline, and prints a JSON response.
 * DataNote handles JSON shuttling, Script does all text work, and Mathx
 * supplies the diagnostics we project back into the UI.
 * Electron expects one JSON object per line.
 */
public final class JockaigneProcessor {

    // ---------------------------------------------------------------------
    // Configuration & dictionaries
    // ---------------------------------------------------------------------

    private static final Map<String, Dictionary> LANGUAGE_DICTIONARIES = loadLanguageDictionaries();

    private JockaigneProcessor() {
    }

    // ---------------------------------------------------------------------
    // Entry point and request handling
    // ---------------------------------------------------------------------

    public static void main(String[] args) throws IOException {

        // Reads lines of JSON from standard input
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;

            // While there are lines to read -> Process each line
            while ((line = reader.readLine()) != null) {
                InputPayload payload = parsePayload(line);
                CorrectionResult result = process(payload);
                System.out.println(result.toJson());
            }
        }
    }

    /**
     * Parses the single JSON line emitted by the Electron main process. Using DataNote
     * lets us work with the nested structures (text + meta.languages)
     */
    private static InputPayload parsePayload(String rawLine) {

        // Handles null or empty input
        if (rawLine == null) {
            return new InputPayload("", List.of());
        }

        // Trims whitespace and checks if the line starts with '{'
        String trimmed = rawLine.trim();
        if (!trimmed.startsWith("{")) {
            return new InputPayload(rawLine, List.of());
        }

        // Tries to parse the trimmed JSON using DataNote
        try {
            DataNote note = DataNote.byJSON(trimmed);

            // If the parsing fails or the note is null, return the raw line with empty languages
            if (note == null) {
                return new InputPayload(rawLine, List.of());
            }

            // Extracts the text and languages from the parsed DataNote
            String text = extractText(note, rawLine);

            // Extract languages from meta.languages if available
            List<String> languages = extractLanguages(note);

            // Returns the extracted text and languages as an InputPayload
            return new InputPayload(text, languages);

        // If the parsing throws an exception, returns the raw line with empty languages as Input Payload
        } catch (RuntimeException ex) {
            return new InputPayload(rawLine, List.of());
        }
    }

    // Helper method to extract text from DataNote with a fallback (used above)
    private static String extractText(DataNote note, String fallback) {
        DataNote textNode = note.at("text");
        return textNode != null ? textNode.asString(fallback) : fallback;
    }

    // Helper method to extract languages from DataNote (used above)
    private static List<String> extractLanguages(DataNote note) {
        DataNote meta = note.at("meta");
        if (meta == null) {
            return List.of();
        }

        DataNote languagesNode = meta.at("languages");
        if (languagesNode == null) {
            return List.of();
        }

        List<String> rawValues = languagesNode.asList(DataNote::asString, List.of());
        if (rawValues == null || rawValues.isEmpty()) {
            return List.of();
        }

        List<String> languages = new ArrayList<>();
        for (String value : rawValues) {
            if (value == null) {
                continue;
            }
            String trimmed = value.trim();
            if (!trimmed.isEmpty()) {
                languages.add(trimmed);
            }
        }
        return languages;
    }

    // Correction Reult processing pipeline
    // Takes the Input Payload from above and returns a CorrectionResult
    private static CorrectionResult process(InputPayload payload) {
        String input = payload.text();

        // Handles null input text
        if (input == null) {
            input = "";
        }

        // Defines a Script for the original input text
        Script original;
        try {
            original = Script.of(input);
        } catch (IllegalArgumentException ex) {
            return CorrectionResult.fallback(input);
        }

        // Runs the normalization and correction pipeline (normalise, applyCorrections, trimWhitespace)
        Script cleaned = normalize(original);
        cleaned = applyCorrections(cleaned);
        cleaned = trimWhitespace(cleaned);


        // Selects the appropriate word dictionary based on the provided languages
        // We use the 'wordfreq' corpora for English and German, falling back to a small custom curated list
        // https://github.com/rspeer/wordfreq
        Dictionary dictionary = selectDictionary(payload.languages());

        // Suggests candidate corrections based on the cleaned text and the selected dictionary
        List<String> suggestions = suggestCandidates(cleaned, dictionary);

        // Collects diagnostics comparing the original and cleaned text
        Diagnostics diagnostics = Diagnostics.collect(original, cleaned);

        // Returns the correction result with the cleaned text, original text as well as diagnostics and the suggestions
        return new CorrectionResult(cleaned.toString(), original.toString(), diagnostics, suggestions);
    }

    // ---------------------------------------------------------------------
    // Normalization & correction pipeline
    // ---------------------------------------------------------------------

    /**
     * Applies Unicode housekeeping via Jockaigne: canonicalizes, collapses surrogates,
     * and removes exotic whitespace while staying inside Script.
     */
    // Top level normalization method that orchestrates the helper functions below
    private static Script normalize(Script script) {
        Script canonical = canonicalize(script);
        Script withPlainSpaces = replaceExoticSpaces(canonical);
        Script withoutRuns = collapseSpaceRuns(withPlainSpaces);
        return dropNonPrintableCharacters(withoutRuns);
    }

    // Canonicalizes the script to a standard form and normalizes it using NFKC
    // e.g. "ﬁ" (U+FB01) becomes "fi" (U+0066 U+0069)
    private static Script canonicalize(Script script) {
        Script standard = script.toStandard();
        return standard.toNormal(Normalizer.Form.NFKC);
    }

    // Replaces all space characters (including non-breaking spaces, tabs, etc.) with a standard space character
    // e.g. "Hello\u00A0World" becomes "Hello World"
    private static Script replaceExoticSpaces(Script script) {
        return script.map(charact -> charact.isSpace(true) ? Charact.SP : charact);
    }

    // Collapses consecutive space characters into a single space character
    // e.g. "Hello   World" becomes "Hello World"
    private static Script collapseSpaceRuns(Script script) {
        return script.compact(charact -> charact.isSpace(true));
    }

    // Removes all non-printable characters from the script
    // e.g. "Hello\u0000World" becomes "HelloWorld"
    private static Script dropNonPrintableCharacters(Script script) {
        return script.filter(charact -> !charact.isPrintable(), true);
    }

    /**
     * Human heuristics layered on top of Script.replace.
     * Examples only: Actual corrections should be domain specific for the best results in a subsequent LLS version.
     * These essentially serve as examples and a demo of Jockaigne more than being a production-ready correction suite.
     * Future Versions of LLS could offer these as toggles even.
     */
    private static Script applyCorrections(Script script) {
        Script withLetters = replaceDigitLookalikes(script);
        Script normalizedQuotes = normalizeTypographicQuotes(withLetters);
        Script normalizedLigatures = normalizeLigatures(normalizedQuotes);
        return resolveHyphenationAndNumericMixups(normalizedLigatures);
    }

    // Replaces digit lookalikes with their likely intended letters in context, using RegEx
    // e.g. "he11o" (with ones) becomes "hello", "f00d" (with zeros) becomes "food"
    private static Script replaceDigitLookalikes(Script script) {
        Script corrected = script;
        corrected = corrected.replace("(?<=\\p{L})1", "l");
        corrected = corrected.replace("1(?=\\p{L})", "l");
        corrected = corrected.replace("(?<=\\p{L})0(?=\\p{L})", "o");
        corrected = corrected.replace("(?<=\\b)0(?=\\p{L})", "O");
        corrected = corrected.replace("(?<=\\p{L})5", "S");
        corrected = corrected.replace("(?<=\\p{L})6", "G");
        corrected = corrected.replace("(?<=\\p{L})8", "B");
        return corrected;
    }

    // Normalizes typographic quotes and backticks to standard ASCII quotes
    // e.g. “Hello” becomes "Hello", ‘test’ becomes 'test'
    private static Script normalizeTypographicQuotes(Script script) {
        Script normalized = script;
        normalized = normalized.replace(Charact.of('“'), Charact.of('"'));
        normalized = normalized.replace(Charact.of('”'), Charact.of('"'));
        normalized = normalized.replace(Charact.of('‘'), Charact.of('\''));
        normalized = normalized.replace(Charact.of('’'), Charact.of('\''));
        normalized = normalized.replace(Charact.of('`'), Charact.of('\''));
        return normalized;
    }

    // Normalizes common ligatures and similar character sequences to their ASCII equivalents
    // e.g. "rn" (misread as "m"), "vv" (misread as "w"), "…" becomes "...", "—" and "–" become "-"
    private static Script normalizeLigatures(Script script) {
        Script normalized = script;
        normalized = normalized.replace(Script.of("rn"), Script.of("m"));
        normalized = normalized.replace(Script.of("vv"), Script.of("w"));
        normalized = normalized.replace(Script.of("…"), Script.of("..."));
        normalized = normalized.replace(Script.of("—"), Script.of("-"));
        normalized = normalized.replace(Script.of("–"), Script.of("-"));
        normalized = normalized.replace(Script.of("¢"), Script.of("c"));
        return normalized;
    }

    // Resolves hyphenation artifacts and numeric/letter mixups from OCR
    // e.g. "co-\noperate" becomes "cooperate", "O" in numbers becomes "0", "l" in numbers becomes "1"
    private static Script resolveHyphenationAndNumericMixups(Script script) {
        Script normalized = script;
        normalized = normalized.replace("(?<=\\p{L})-\\s+(?=\\p{L})", "");
        normalized = normalized.replace("(?<=\\d)l(?=\\d)", "1");
        normalized = normalized.replace("(?<=\\d)[Oo](?=\\d)", "0");
        normalized = normalized.replace("(?<=\\b)[I|](?=\\p{Ll}{2})", "l");
        return normalized;
    }

    // Trims leading and trailing whitespace from the script
    // e.g. "   Hello World   " becomes "Hello World"
    private static Script trimWhitespace(Script script) {
        return script.filter(Charact::isSpace, true, true, true);
    }

    // ---------------------------------------------------------------------
    // Dictionary selection and suggestion logic
    // ---------------------------------------------------------------------

    /**
     * Picks a language-specific dictionary when available, based on the user's language preferences.
     * Falls back to English or a generic dictionary if no match is found.
     *
     * Takes a List of language codes (e.g., ["en", "de"]).
     * Returns the best matching Dictionary for the user's language, or a default.
     */
    private static Dictionary selectDictionary(List<String> languages) {
        // Tries to find the preferred dictionary for the user's language(s)
        Dictionary preferred = selectPreferredDictionary(languages);
        // If none is found, falls back to the default dictionary (English or fallback)
        return preferred != null ? preferred : selectDefaultDictionary();
    }

    /**
     * Attempts to find a dictionary matching any of the user's preferred languages.
     * Normalizes the language codes (e.g., "en-US" → "en", "ger" → "de") and checks for a match.
     *
     * Takes a List of language codes, possibly with region or variant (e.g., "en-US").
     * Returns the first matching Dictionary, or null if none is found.
     */
    private static Dictionary selectPreferredDictionary(List<String> languages) {
        if (languages == null) {
            return null;
        }

        for (String language : languages) {
            if (language == null) {
                continue;
            }
            // Normalizes the language code to a supported key (e.g., "en", "de")
            String normalized = normalizeLanguageCode(language);
            Dictionary dictionary = LANGUAGE_DICTIONARIES.get(normalized);
            if (dictionary != null) {
                return dictionary;
            }
        }
        return null;
    }

    /**
     * Returns the default dictionary to use if no language match is found.
     * Prefers English if available, otherwise returns an empty dictionary.
     * Used above.
     */
    private static Dictionary selectDefaultDictionary() {
        if (LANGUAGE_DICTIONARIES.isEmpty()) {
            return new Dictionary(List.of());
        }
        return LANGUAGE_DICTIONARIES.getOrDefault("en", new Dictionary(List.of()));
    }

    /**
     * Normalizes a language code to a supported dictionary key.
     * Maps codes starting with "en" to "en", "de"/"ger" to "de"; otherwise returns the lowercased code.
     *
     * Takes the language code (e.g., "en-US", "de-DE", "ger").
     * Returns a normalized language key for dictionary lookup.
     */
    private static String normalizeLanguageCode(String language) {
        String lower = language.toLowerCase(Locale.ROOT);
        if (lower.startsWith("en")) {
            return "en";
        }
        if (lower.startsWith("de") || lower.startsWith("ger")) {
            return "de";
        }
        return lower;
    }

    /**
     * Suggests replacements by walking the Script tokens and comparing them against our dictionary entries using
     * Levenshtein distance.
     * Levenshtein: https://en.wikipedia.org/wiki/Levenshtein_distance
     */
    private static List<String> suggestCandidates(Script script, Dictionary dictionary) {
        // Splits the script into tokens based on whitespace and punctuation
        List<Script> tokens = script.split();

        // Early exit if there are no tokens to process
        if (tokens.isEmpty()) {
            return List.of();
        }

        // Prepares the lookup set for dictionary membership checks
        Set<Script> dictionaryLookup = dictionary.lookup();
        // Prepares an ordered list of dictionary entries for the candidate search
        List<Script> dictionaryEntries = dictionary.entries();
        int maxSuggestions = 5;

        // Uses a LinkedHashSet to preserve insertion order and avoid duplicates
        LinkedHashSet<String> matches = new LinkedHashSet<>();

        // We then loop over each token in the input script
        for (Script token : tokens) {
            // We only consider tokens that are not too short/long, not already in the dictionary, and look like words
            if (!isCandidateToken(token, dictionaryLookup)) {
                continue;
            }

            // Finds the closest dictionary entry to the token using Levenshtein distance
            Suggestion suggestion = findClosest(token, dictionaryEntries);

            // If we dont find a suggestion, we skip to the next token
            if (suggestion != null) {
                matches.add(suggestion.word());
            }
            // Stops if we've reached the maximum number of suggestions
            // Currently set to 5 suggestions per input for performance and relevancy reasons
            if (matches.size() >= maxSuggestions) {
                break;
            }
        }
        // Returns the suggestions as an immutable list
        return List.copyOf(matches);
    }

    // Checks if a token is a valid candidate for suggestion (not too short/long, not already a known word, looks like a word)
    private static boolean isCandidateToken(Script token, Set<Script> dictionary) {
        int tokenLength = token.extent();
        if (tokenLength < 3 || tokenLength > 20) {
            return false;
        }
        Script lower = token.toLower(Locale.ROOT);
        boolean isKnownWord = dictionary.contains(lower);
        if (isKnownWord) {
            return false;
        }
        // Only suggests for tokens that look like identifiers (words)
        return lower.isIdentifier(true);
    }

    // Finds the closest dictionary entry to the token using Levenshtein distance, with additional heuristics
    private static Suggestion findClosest(Script token, List<Script> dictionary) {

        // Early exit if the dictionary is empty
        if (dictionary.isEmpty()) {
            return null;
        }

        // Initializes variables to track the best match found
        int bestDistance = Integer.MAX_VALUE;
        String bestWord = null;
        int tokenLength = token.extent();
        Charact firstCharacter = tokenLength > 0 ? token.at(0) : null;

        // We loop over each entry in the dictionary
        for (Script entry : dictionary) {
            // Skips entries that differ too much in length
            int lengthGap = Math.abs(entry.extent() - tokenLength);
            if (!isLengthCompatible(lengthGap)) {
                continue;
            }

            // Skips entries that don't share a viable leading character (unless length is very close)
            if (!sharesViableLeadingCharacter(firstCharacter, entry, lengthGap)) {
                continue;
            }

            // Computes Levenshtein distance between token and dictionary entry
            int distance = token.distance(entry, Distance.Levenshtein);
            // If the distance is better than the best found so far, we update our best match
            if (distance < bestDistance) {
                bestDistance = distance;
                bestWord = entry.toString();
                // Early exit if perfect match is found
                if (bestDistance == 0) {
                    break;
                }
            }
        }

        // Only returns suggestions within a reasonable edit distance threshold
        return buildSuggestion(bestWord, bestDistance);
    }

    // Returns true if the length difference is within the allowed threshold for suggestions
    private static boolean isLengthCompatible(int lengthGap) {
        return lengthGap <= 2;
    }

    // Returns true if the entry shares the same first character as the token, or if the length is very close
    private static boolean sharesViableLeadingCharacter(Charact firstCharacter, Script entry, int lengthGap) {
        if (firstCharacter == null || entry.extent() == 0) {
            return true;
        }

        boolean sameFirstCharacter = entry.at(0).equals(firstCharacter);
        if (sameFirstCharacter) {
            return true;
        }

        // Requires a tighter length match when the first character differs to avoid aggressive substitutions
        return lengthGap <= 1;
    }

    // Builds a Suggestion object if the best match is within the allowed edit distance threshold
    private static Suggestion buildSuggestion(String bestWord, int bestDistance) {
        if (bestWord == null) {
            return null;
        }
        boolean withinThreshold = bestDistance > 0 && bestDistance <= 2;
        return withinThreshold ? new Suggestion(bestWord, bestDistance) : null;
    }

    /**
     * Loads the bundled corpora and wraps each list in a Dictionary record so we keep both the ordered entries and a
     * quick lookup set. (wordfreq)
     */
    private static Map<String, Dictionary> loadLanguageDictionaries() {
        // Language Corpora Entries
        Map<String, List<Script>> entriesByLanguage = new LinkedHashMap<>();
        entriesByLanguage.put("en", loadWordList("corpus/en_words.txt"));
        entriesByLanguage.put("de", loadWordList("corpus/de_words.txt"));

        // Wraps each list in a Dictionary record for easy access
        Map<String, Dictionary> dictionaries = new LinkedHashMap<>();
        for (Map.Entry<String, List<Script>> entry : entriesByLanguage.entrySet()) {
            dictionaries.put(entry.getKey(), new Dictionary(entry.getValue()));
        }

        return Collections.unmodifiableMap(dictionaries);
    }

    /**
     * Reads a newline-separated word list from either the packaged jar or the local project tree.
     * Used above.
     * Takes the path to a resource file (e.g., "corpus/en_words.txt").
     */
    private static List<Script> loadWordList(String resourcePath) {
        LinkedHashSet<Script> words = new LinkedHashSet<>();

        BufferedReader reader = null;
        try {
            reader = openResourceReader(resourcePath);
            if (reader == null) {
                System.err.println("[JockaigneProcessor] Word list not found: " + resourcePath);
                throw new RuntimeException("Word list not found: " + resourcePath);
            }
            populateWordsFromReader(reader, words);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to load word list: " + resourcePath, ex);
        } finally {
            if (reader != null) {
                try {
                    reader.close();
                } catch (IOException ignored) {
                }
            }
        }

        if (words.isEmpty()) {
            System.err.println("[JockaigneProcessor] Word list is empty: " + resourcePath);
            throw new RuntimeException("Word list is empty: " + resourcePath);
        }

        return List.copyOf(words);
    }

    /**
     * Reads lines from a BufferedReader and populates a set of Script words.
     * Skips empty lines and lines starting with '#' (comments), and normalizes all words to lowercase.
     * This ensures the dictionary contains only valid entries.
     */
    private static void populateWordsFromReader(BufferedReader reader, LinkedHashSet<Script> words) throws IOException {
        if (reader == null) {
            return;
        }

        // Line in the file
        String line;

        // While there are lines to read, processes and adds them to the set
        while ((line = reader.readLine()) != null) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            Script normalized = Script.of(trimmed).toLower(Locale.ROOT);
            words.add(normalized);
        }
    }

    /**
     * Tries to open a resource (word list file) from several possible locations:
     *   1. As a resource inside the JAR/classpath (for production/deployment)
     *   2. In the java/resources/ directory (for development)
     *   3. In the current working directory (for manual overrides or testing)
     * Returns a BufferedReader for the first location where the file is found, or null if not found.
     *
     * Allows the same codebase to work both when running from a packaged JAR and in development
     * , and supports multiple resource locations without code changes.
     */
    private static BufferedReader openResourceReader(String resourcePath) throws IOException {
        // Path construction
        String normalized = resourcePath.startsWith("/") ? resourcePath : "/" + resourcePath;
        InputStream resourceStream = JockaigneProcessor.class.getResourceAsStream(normalized);

        if (resourceStream != null) {
            return new BufferedReader(new InputStreamReader(resourceStream, StandardCharsets.UTF_8));
        }

        // Project dir
        Path resourceInProject = Path.of("java", "resources", resourcePath);
        if (Files.exists(resourceInProject)) {
            return Files.newBufferedReader(resourceInProject, StandardCharsets.UTF_8);
        }

        // Working dir
        Path resourceInWorkingDirectory = Path.of(resourcePath);
        if (Files.exists(resourceInWorkingDirectory)) {
            return Files.newBufferedReader(resourceInWorkingDirectory, StandardCharsets.UTF_8);
        }
        return null;
    }

    // ---------------------------------------------------------------------
    // Records used throughout the pipeline
    //   - InputPayload bundles the incoming OCR text with any declared languages so the parse step can hand a single object downstream
    //   - Suggestion captures the chosen dictionary word plus its Levenshtein distance; it gives the lookup loop a structured return instead of juggling parallel variables
    //   - Dictionary stores the language’s entries and a matching lookup set so membership can be tested quickly and still iterate in insertion order
    //   - CorrectionResult carries the cleaned text, the original Script, diagnostics, and suggestions, and exposes toJson() to serialize the response with the DataNote
    //   - Diagnostics groups all the metrics we calculate (similarity, editDistance, ratios, diversity, tallies)
    //   - RatioStats is a helper record that computes printable and ASCII ratios once and passes them back to Diagnostics
    //
    // https://www.baeldung.com/java-record-keyword
    // ---------------------------------------------------------------------

    private record InputPayload(String text, List<String> languages) {
    }

    private record Suggestion(String word, int distance) {
    }

    private record Dictionary(List<Script> entries, Set<Script> lookup) {
        Dictionary(List<Script> entries) {
            this(List.copyOf(entries), new LinkedHashSet<>(entries));
        }

        Dictionary(List<Script> entries, Set<Script> lookup) {
            this.entries = List.copyOf(entries);
            this.lookup = Set.copyOf(lookup);
        }
    }

    /**
     * CorrectionResult wraps the cleaned text, the original payload, and all diagnostics in one immutable bundle.
     */
    private record CorrectionResult(String cleaned, String original, Diagnostics diagnostics, List<String> suggestions) {
        static CorrectionResult fallback(String text) {
            Diagnostics emptyDiagnostics = Diagnostics.empty();
            return new CorrectionResult(text, text, emptyDiagnostics, List.of());
        }

        // Constructs the JSON representation of the correction result
        String toJson() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("text", cleaned);
            payload.put("original", original);
            payload.put("diagnostics", diagnostics.toMap());
            payload.put("suggestions", suggestions);

            // Serializes the payload via DataNote.
            DataNote note = new DataNote(payload);
            return note.asJSON(false);
        }
    }

    /**
     * Metrics recorded for each correction round. They are fed back into the renderer and logged for debugging.
     */
    private record Diagnostics(
        double similarity,
        int editDistance,
        double printableRatio,
        double asciiRatio,
        double diversity,
        Map<String, Integer> topCharacters,
        Map<String, Integer> topBigrams
    ) {
        static Diagnostics collect(Script original, Script cleaned) {
            double similarity = cleaned.similarity(original, Similitude.Levenshtein);
            int distance = cleaned.distance(original, Distance.Levenshtein);
            RatioStats ratios = RatioStats.from(cleaned);
            double diversity = computeDiversity(cleaned);
            Map<String, Integer> characters = tallyTopCharacters(cleaned, 5);
            Map<String, Integer> bigrams = tallyTopBigrams(cleaned, 5);

            return new Diagnostics(similarity, distance, ratios.printableRatio(), ratios.asciiRatio(), diversity, characters, bigrams);
        }

        // Returns an empty Diagnostics instance with default values
        static Diagnostics empty() {
            return new Diagnostics(1.0, 0, 1.0, 1.0, Double.NaN, Map.of(), Map.of());
        }

        // Converts the diagnostics to a map for JSON serialization
        Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("similarity", similarity);
            map.put("editDistance", editDistance);
            map.put("printableRatio", printableRatio);
            map.put("asciiRatio", asciiRatio);
            map.put("diversity", diversity);
            map.put("topCharacters", topCharacters);
            map.put("topBigrams", topBigrams);
            return map;
        }

        // Calculates Shannon diversity of characters in the script
        private static double computeDiversity(Script script) {
            try {
                List<Charact> chars = script.toList();
                return chars.isEmpty() ? Double.NaN : Mathx.diversity(chars, Diversity.Shannon);
            } catch (RuntimeException ex) {
                return Double.NaN;
            }
        }

        // Tallies the most frequent characters and bigrams in the script, returning the top N entries
        private static Map<String, Integer> tallyTopCharacters(Script script, int limit) {
            Map<Charact, Integer> tally = script.tally();

            // Sorts entries by frequency in descending order
            List<Map.Entry<Charact, Integer>> sortedEntries = new ArrayList<>(tally.entrySet());
            sortedEntries.sort(Map.Entry.<Charact, Integer>comparingByValue(Comparator.reverseOrder()));

            // Collects the top N entries into a LinkedHashMap to preserve order
            LinkedHashMap<String, Integer> topEntries = new LinkedHashMap<>();
            for (Map.Entry<Charact, Integer> entry : sortedEntries) {
                if (topEntries.size() >= limit) {
                    break;
                }
                topEntries.put(entry.getKey().toString(), entry.getValue());
            }
            return topEntries;
        }

        // Tallies the most frequent bigrams (2-character sequences) in the script, returning the top N entries
        private static Map<String, Integer> tallyTopBigrams(Script script, int limit) {
            if (script.extent() < 2) {
                return Map.of();
            }

            Map<Script, Integer> tally = Mathx.tally(script.grammy(2));

            // Sorts entries by frequency in descending order
            List<Map.Entry<Script, Integer>> sortedEntries = new ArrayList<>(tally.entrySet());
            sortedEntries.sort(Map.Entry.<Script, Integer>comparingByValue(Comparator.reverseOrder()));

            // Collects the top N entries into a LinkedHashMap to preserve order
            LinkedHashMap<String, Integer> topEntries = new LinkedHashMap<>();
            for (Map.Entry<Script, Integer> entry : sortedEntries) {
                if (topEntries.size() >= limit) {
                    break;
                }
                topEntries.put(entry.getKey().toString(), entry.getValue());
            }
            return topEntries;
        }
    }

    // Helper record to compute and store printable and ASCII character ratios
    private record RatioStats(double printableRatio, double asciiRatio) {

        static RatioStats from(Script script) {
            Map<Charact, Integer> tally = script.tally();
            int total = script.extent();
            if (total == 0) {
                return new RatioStats(1.0, 1.0);
            }

            // Counts printable and ASCII characters
            int printableCount = 0;
            int asciiCount = 0;
            for (Map.Entry<Charact, Integer> entry : tally.entrySet()) {
                int occurrences = entry.getValue();
                if (entry.getKey().isPrintable()) {
                    printableCount += occurrences;
                }
                if (entry.getKey().isASCII(true)) {
                    asciiCount += occurrences;
                }
            }

            double printableRatio = (double) printableCount / total;
            double asciiRatio = (double) asciiCount / total;
            return new RatioStats(printableRatio, asciiRatio);
        }
    }
}
