const config = require('../../config');
const chalk = require('chalk');

const xmlService = require('../../services/xml-service');
const logger = require('../../services/logger')('a', 'submission');

const biosampleGenerator = require('./biosample');

getRowValue = (data, values, field) => {
    let colIndex = data.metadata.columnIndexMap[field];
    return colIndex || colIndex === 0 ? values[colIndex] : undefined;
}

module.exports = {
    generate: (submissionParams, data) => {
        let ret = {
            Submission: {
                '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
                '@xsi:noNamespaceSchemaLocation': 'http://www.ncbi.nlm.nih.gov/viewvc/v1/trunk/submit/public-docs/common/submission.xsd',
                '@schema_version': '2.0',
                Description: module.exports.getDescriptionXml(submissionParams, data),
                Action: module.exports.getSelectedActionDataXml(submissionParams, data)
            }
        };

        let validationObj = xmlService.validateXml('Submission', ret, true);
        if (validationObj.isValid) {
            logger.debug('Submission XML is valid');
            return ret;
        }
        else {
            logger.log(chalk.red(
                '\nThe submission xml file fails validation. Please check your config\n' 
                + 'file and try again. If the problem persists, please send us your\n'
                + '   1. input tsv file\n'
                + '   2. output xml file\n'
                + '   3. /logs/debug.log\n'
            ), false);
            process.exit(1);
        }
    },

    getDescriptionXml: (submissionParams, data) => {
        return {
            ...(submissionParams.comment && { 'Comment': submissionParams.comment }),
            ...(config.submitterConfig && {
                Submitter: {
                    ...(config.submitterConfig.contact && config.submitterConfig.contact.email && {
                        Contact: {
                            '@email': config.submitterConfig.contact.email
                        }
                    }),
                    ...(config.submitterConfig.account_id && { '@account_id': config.submitterConfig.account_id })
                }
            }),
            Organization: {
                Name: config.organizationConfig.name,
                '@type': config.organizationConfig.type,
                ...(config.organizationConfig.address && {
                    Address: {
                        ...(config.organizationConfig.address.department && { 'Department': config.organizationConfig.address.department }),
                        ...(config.organizationConfig.address.institution && { 'Institution': config.organizationConfig.address.institution }),
                        ...(config.organizationConfig.address.street && { 'Street': config.organizationConfig.address.street }),
                        ...(config.organizationConfig.address.city && { 'City': config.organizationConfig.address.city }),
                        ...(config.organizationConfig.address.state && { 'Sub': config.organizationConfig.address.state }),
                        ...(config.organizationConfig.address.country && { 'Country': config.organizationConfig.address.country }),
                        ...(config.organizationConfig.address.postal_code && { '@postal_code': config.organizationConfig.address.postal_code }),
                    }
                }),
                Contact: {
                    '@email': config.organizationConfig.contact.email
                },
                ...(config.organizationConfig.role && { '@role': config.organizationConfig.role }),
                ...(config.organizationConfig.role && { '@org_id': config.organizationConfig.org_id }),
                ...(config.organizationConfig.role && { '@group_id': config.organizationConfig.group_id }),
                ...(config.organizationConfig.role && { '@url': config.organizationConfig.url }),
            },
            ...(submissionParams.hold && { Hold: { '@release_date': submissionParams.hold }}),
            SubmissionSoftware: {
                '@version': 'asymmetrik-tsv@1.0.0'
            }
        };
    },

    getSelectedActionDataXml: (submissionParams, data) => {
        switch (submissionParams.selectedAction) {
            case 'AddData': return module.exports.getAddDataXml(submissionParams, data);
            default: return {};
        }
    },

    getAddDataXml: (submissionParams, data) => {
        return data.rows.map((d, rowNum) => {
            if (!d) { return; }
    
            // Log current progress, just in case this takes a long time
            let dateString = new Date().toLocaleTimeString();
            let percentageCompleted = Math.floor(rowNum * 100.0 / data.rows.length);
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            process.stdout.write(` ${dateString}\t| tsv->xml | \tProcessing {${submissionParams.inputFilename}.tsv}\t${percentageCompleted}%`);
    
            let values = d
                .replace('\r', '')
                .split('\t');
    
            // Store data to map organism tsv row by name
            data.metadata.dataMap[getRowValue(data, values, 'sample_name')] = d;
    
            let rowRet = {
                // These fields exist, but they are unexplained in the xsd
                // '@action_id': 'REPLACEME: token type',
                // '@submitter_tracking_id': 'REPLACEME: string maxlength 255',
                AddData: {
                    '@target_db': 'BioSample',
                    Data: {
                        '@content_type': 'XML',
                        XmlContent: {
                            ...(biosampleGenerator.generate(data, values))
                        }
                    },
                    Identifier: {
                        SPUID: {
                            '@spuid_namespace': config.organizationConfig.spuid_namespace,
                            '#text': config.organizationConfig.spuid
                        }
                    }
                }
            }
    
            return rowRet;
        });
    }

};